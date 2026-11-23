// Who a factory issue belongs to. The owner is the issue's assignee; an
// unassigned issue belongs to the person who created it. Each Coordinator
// runs under one GitHub login and only ever works on its own issues, so two
// factories on one repository never compete for an issue.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOME_ID, config } from "./config.mjs";
import { apiAll, listAssignedToMe, listQueue, viewer } from "./github-client.mjs";
import { readRunState } from "./run-state.mjs";
import { STATE_PATH } from "./state-store.mjs";

// Written by `start --takeover`: adopt this login's runs from another Factory home.
export const TAKEOVER_FILE = join(dirname(STATE_PATH), "takeover");
const OVER = new Set(["merged", "canceled"]);

const history = (key) => apiAll(`issues/${key}/events?per_page=100`);
const last = (events, test) => events.filter(test).at(-1);

function assignedAt(events, login) {
  return last(events, (e) => e.event === "assigned" && e.assignee?.login === login)?.created_at ?? null;
}

// One assignee: that login. Several: the one assigned first. None: the
// issue's creator (this login also takes issues created by github.claimFor logins).
export function ownerOf(issue, events = null) {
  const me = viewer();
  const assignees = issue.assignees;
  if (assignees.length === 1) return assignees[0];
  if (assignees.length > 1) {
    events ??= history(issue.key);
    return assignees.map((l) => [assignedAt(events, l) ?? "9999", l]).sort((a, b) => (a[0] < b[0] ? -1 : 1))[0][1];
  }
  const author = issue.author;
  if (!author) return null;
  return author === me || config.github.claimFor.includes(author) ? me : author;
}

// Issues this Coordinator should start now:
//   newIssues  mine and ready: `mode` start (fresh) or takeover (continue an earlier run's branch)
//   pending    handed to me, but the previous owner's factory has not let go yet
//   foreign    mine, but run by another Factory home of this same login (see `start --takeover`)
export function findWork(state) {
  const me = viewer();
  const { queueLabel, pauseLabel, handoverWaitMinutes } = config.github;
  const takeover = existsSync(TAKEOVER_FILE);
  const out = { newIssues: [], pending: [], foreign: [] };
  const untracked = (i) => !state.issues[i.key] || config.phases[state.issues[i.key].phase]?.final;
  const inFlight = (i) => i.statusLabels.length && !i.statusLabels.some((l) => l === queueLabel || l === pauseLabel);
  const queued = listQueue().filter(untracked);
  const queuedKeys = new Set(queued.map((i) => i.key));
  const handed = listAssignedToMe().filter((i) => inFlight(i) && !queuedKeys.has(i.key))
    .filter((i) => !state.issues[i.key] || state.issues[i.key].phase === "released");

  for (const issue of [...queued, ...handed]) {
    const events = issue.assignees.length > 1 ? history(issue.key) : null;
    if (ownerOf(issue, events) !== me) continue;
    const run = readRunState(issue.key);
    const live = run && !OVER.has(run.phase) ? run : null;
    // Without the queue label, only an unfinished run is picked up.
    if (!queuedKeys.has(issue.key) && !live) continue;
    const base = { key: issue.key, title: issue.title, url: issue.url };
    const released = live?.phase === "released";
    if (live && live.owner === me && live.home !== HOME_ID && !released && !takeover) {
      out.foreign.push({ ...base, home: live.home, phase: live.phase });
      continue;
    }
    if (live && live.owner !== me && !released) {
      const at = assignedAt(events ?? history(issue.key), me);
      if (at && Date.now() - Date.parse(at) < handoverWaitMinutes * 60000) {
        out.pending.push({ ...base, waitingFor: live.owner });
        continue;
      }
    }
    out.newIssues.push({
      ...base,
      branchName: live?.branchName ?? issue.branchName,
      requeued: Boolean(state.issues[issue.key]),
      mode: live?.branchName ? "takeover" : "start",
      previous: live ? { owner: live.owner, phase: live.phase, round: live.round, pr: live.pr, prUrl: live.prUrl, size: live.size } : null,
    });
  }
  return out;
}

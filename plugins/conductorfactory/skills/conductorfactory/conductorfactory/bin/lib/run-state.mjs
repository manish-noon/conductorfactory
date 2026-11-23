// The run's essentials, kept on GitHub: a hidden marker at the end of the
// "Factory run" comment. The local state file is the working copy; this is
// what lets another person's factory, or a new Factory home, take a run over.

import { HOME_ID } from "./config.mjs";
import { apiAll, viewer } from "./github-client.mjs";
import { isFactory } from "./prefix.mjs";

const TAG = "factory-state";
const MARKER = new RegExp(`<!-- ${TAG} (\\{.*\\}) -->`);

export function stateMarker(entry) {
  const data = {
    v: 1,
    owner: viewer(),
    home: HOME_ID,
    phase: entry.phase ?? null,
    round: entry.round ?? 1,
    branchName: entry.branchName ?? null,
    pr: entry.pr ?? null,
    prUrl: entry.prUrl ?? null,
    size: entry.size ?? null,
    headSha: entry.headSha ?? null,
    at: new Date().toISOString(),
  };
  return `<!-- ${TAG} ${JSON.stringify(data)} -->`;
}

// The newest run state on an issue, or null when no factory has run it.
export function readRunState(key) {
  const found = apiAll(`issues/${key}/comments?per_page=100`)
    .filter((c) => isFactory(c.body ?? "") && MARKER.test(c.body))
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
    .at(-1);
  if (!found) return null;
  try {
    return JSON.parse(found.body.match(MARKER)[1]);
  } catch {
    return null;
  }
}

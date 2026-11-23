#!/usr/bin/env node
// One Coordinator poll. Gathers everything a tick needs into one JSON document
// so the agent only reasons when something changed:
//   newIssues  this login's issues to start: queued ones, and runs handed over to it
//   pending    handed-over runs still waiting for the previous owner's factory to let go
//   foreign    this login's runs that belong to another Factory home
//   tracked    per active issue: issue state and labels, the status guard, PR + CI
//              status, unprocessed worker results, and new human feedback (issue + PR)
// Session states come from Conductor tools, not from here.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getIssue, listIssueFeedback, listPrFeedback, readPr, viewer } from "./lib/github-client.mjs";
import { findWork, ownerOf } from "./lib/ownership.mjs";
import { FINAL_PHASES, config, expectedStatus } from "./lib/config.mjs";
import { readState } from "./lib/state-store.mjs";

const ROLES = ["builder", "verifier", "reviewer"];

// A worker result is "new" when its writtenAt is later than the last one the
// Coordinator processed for that role.
function readResults(entry) {
  if (!entry.workspacePath) return {};
  const out = {};
  for (const role of ROLES) {
    const file = join(entry.workspacePath, ".context", "factory", `${role}.json`);
    if (!existsSync(file)) continue;
    const result = JSON.parse(readFileSync(file, "utf8"));
    const seen = entry.processed?.[role];
    if (!seen || Date.parse(result.writtenAt) > Date.parse(seen)) out[role] = result;
  }
  return out;
}

// Human comments since the watermarks the Coordinator stores in entry.seen
// (set at claim time, advanced after each forward).
function readFeedback(entry) {
  const since = entry.seen ?? {};
  const issue = since.issue ? listIssueFeedback(entry.key, since.issue) : [];
  const pr = entry.pr && since.pr ? listPrFeedback(entry.pr, since.pr) : [];
  return [...issue, ...pr].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

// What the issue's labels and state say, compared with the phase:
//   ok       the one status label matches the phase
//   closed   a human closed the issue and its PR is not merged
//   reassigned  the issue now belongs to another owner: let it go
//   unassigned  nobody is assigned any more: put this login back
//   paused   a human added the pause label
//   resumed  a paused issue got the queue label again
//   drift    the status label is missing, wrong, or not the only one
function statusGuard(entry, issue, pr) {
  const { queueLabel, pauseLabel } = config.github;
  const has = (label) => issue.statusLabels.includes(label);
  if (pr?.state === "MERGED") return "ok";
  if (issue.state === "CLOSED") return "closed";
  if (!issue.assignees.length) return "unassigned";
  if (ownerOf(issue) !== viewer()) return "reassigned";
  if (entry.phase === "paused") return has(queueLabel) ? "resumed" : "ok";
  if (has(pauseLabel)) return "paused";
  const expected = expectedStatus(entry.phase);
  if (expected && !(issue.statusLabels.length === 1 && has(expected))) return "drift";
  return "ok";
}

function trackedIssue(entry) {
  const issue = getIssue(entry.key);
  const pr = entry.pr ? readPr(entry.pr) : null;
  return {
    phase: entry.phase,
    round: entry.round,
    issueState: issue.state,
    statusLabels: issue.statusLabels,
    assignees: issue.assignees,
    guard: statusGuard(entry, issue, pr),
    pr,
    newResults: readResults(entry),
    feedback: readFeedback(entry),
  };
}

function main() {
  const state = readState();
  const { newIssues, pending, foreign } = findWork(state);

  const tracked = {};
  for (const entry of Object.values(state.issues)) {
    if (FINAL_PHASES.has(entry.phase)) continue;
    tracked[entry.key] = trackedIssue(entry);
  }
  const active = Object.values(state.issues).filter((e) => !FINAL_PHASES.has(e.phase)).length;
  console.log(JSON.stringify({ at: new Date().toISOString(), owner: viewer(), active, newIssues, pending, foreign, tracked }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

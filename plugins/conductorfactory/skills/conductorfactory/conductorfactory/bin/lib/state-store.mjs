// The Coordinator's state file: one entry per GitHub issue, keyed by its number.
// Lives in the Factory home's gitignored .context/ folder. Writes are
// atomic (temp file + rename) so a crash mid-write never leaves broken JSON.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { FACTORY_HOME } from "./config.mjs";

export const STATE_PATH =
  process.env.FACTORY_STATE ??
  join(FACTORY_HOME, ".context", "factory", "state.json");

export function readState() {
  if (!existsSync(STATE_PATH)) return { issues: {} };
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

export function writeState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  const tmp = `${STATE_PATH}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, STATE_PATH);
}

// Shallow-merges patch into the entry; plain-object fields merge one level deep
// (so { sessions: { reviewer: "…" } } keeps the builder session id).
export function mergeEntry(key, patch) {
  const state = readState();
  const entry = state.issues[key] ?? { key, round: 1, history: [] };
  for (const [field, value] of Object.entries(patch)) {
    const isObject = value && typeof value === "object" && !Array.isArray(value);
    entry[field] = isObject ? { ...(entry[field] ?? {}), ...value } : value;
  }
  state.issues[key] = entry;
  writeState(state);
  return entry;
}

// Moves an entry to state.archive (kept for metrics) so the issue can be
// claimed again from scratch, e.g. re-queued after being canceled.
export function archiveEntry(key) {
  const state = readState();
  const entry = state.issues[key];
  if (!entry) throw new Error(`No state entry for ${key}`);
  state.archive = state.archive ?? {};
  state.archive[key] = [...(state.archive[key] ?? []), { ...entry, archivedAt: new Date().toISOString() }];
  delete state.issues[key];
  writeState(state);
  return { archived: key, runs: state.archive[key].length };
}

// Appends a timestamped event. Phase changes are logged as event "phase" with
// detail { phase }, which is what the run comment uses to time each stage.
// `at` back-dates the event (e.g. to a worker result's writtenAt). Phase events
// must stay in order, so it is clamped between the last phase event and now.
export function logEvent(key, event, detail = {}, at = null) {
  const state = readState();
  const entry = state.issues[key];
  if (!entry) throw new Error(`No state entry for ${key}`);
  entry.history.push({ at: eventTime(entry.history, at), event, ...detail });
  if (event === "phase") entry.phase = detail.phase;
  writeState(state);
  return entry;
}

function eventTime(history, at) {
  const now = Date.now();
  if (!at || Number.isNaN(Date.parse(at))) return new Date(now).toISOString();
  const lastPhase = history.filter((h) => h.event === "phase").at(-1);
  const floor = lastPhase ? Date.parse(lastPhase.at) : -Infinity;
  return new Date(Math.min(now, Math.max(floor, Date.parse(at)))).toISOString();
}

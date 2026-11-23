#!/usr/bin/env node
// Coordinator state CLI. Prints JSON.
//
//   state show [KEY]                     whole state, or one entry
//   state set <KEY> '<json patch>'       merge fields into an entry (creates it)
//   state log <KEY> <event> ['<json>']   append a timestamped event
//   state phase <KEY> <phase> [--at ISO] log a phase change (times the run comment) and set
//                                        the phase's issue label (phases.<phase>.status in the
//                                        config); --at back-dates the event, e.g. to a result's
//                                        writtenAt
//   state render <KEY>                   print the run-comment markdown
//   state archive <KEY>                  move a finished entry to the archive (allows re-claim)
//   state metrics <KEY> [--md]           final run JSON: cost per session, time, human interventions
//
// KEY is the issue number. Phases are the keys of `phases` in the config.

import { PHASES, config, expectedStatus } from "./lib/config.mjs";
import { setStatus } from "./lib/github-client.mjs";
import { STATE_PATH, archiveEntry, logEvent, mergeEntry, readState } from "./lib/state-store.mjs";
import { renderRunComment } from "./lib/run-comment.mjs";
import { buildRunMetrics, renderMetricsComment } from "./lib/run-metrics.mjs";


const commands = {
  show([key]) {
    const state = readState();
    return key ? state.issues[key] ?? null : { path: STATE_PATH, ...state };
  },
  set([key, json]) {
    return mergeEntry(key, JSON.parse(json));
  },
  log([key, event, json]) {
    return logEvent(key, event, json ? JSON.parse(json) : {});
  },
  // The event is logged first, so a GitHub failure never loses the phase; the
  // Coordinator's status guard (section F) retries the label next tick.
  async phase([key, phase, flag, at]) {
    if (!PHASES.has(phase)) throw new Error(`Unknown phase ${phase}`);
    const entry = logEvent(key, "phase", { phase }, flag === "--at" ? at : null);
    const status = expectedStatus(phase);
    if (status) setStatus(key, status);
    return { ...entry, statusLabel: status ?? "unchanged" };
  },
  archive([key]) {
    return archiveEntry(key);
  },
  metrics([key, flag]) {
    const entry = readState().issues[key];
    if (!entry) throw new Error(`No state entry for ${key}`);
    const metrics = buildRunMetrics(entry);
    return flag === "--md" ? renderMetricsComment(metrics) : metrics;
  },
  render([key]) {
    const entry = readState().issues[key];
    if (!entry) throw new Error(`No state entry for ${key}`);
    return renderRunComment(entry, config.limits.maxRounds);
  },
};

const [cmd, ...args] = process.argv.slice(2);
try {
  if (!commands[cmd]) throw new Error(`usage: state <${Object.keys(commands).join("|")}> …`);
  const out = await commands[cmd](args);
  console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

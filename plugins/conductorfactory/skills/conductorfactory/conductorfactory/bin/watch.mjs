#!/usr/bin/env node
// The Coordinator's watcher. Run it as a background command; it polls every
// watcher.pollSeconds (the factory config) with no model cost and EXITS only
// when there is work, printing why plus the poll JSON. Exiting is what wakes the
// Coordinator. While issues are in flight it also exits every
// watcher.heartbeatMinutes so the Coordinator can check session health, which no
// script can see. Poll failures never wake it: it backs off and keeps polling.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIVE_PHASES, config, expectedStatus } from "./lib/config.mjs";
import { otherHome, takeLock } from "./lib/home-lock.mjs";
import { STATE_PATH, readState } from "./lib/state-store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const POLL_MS = config.watcher.pollSeconds * 1000;
const HEARTBEAT_MS = config.watcher.heartbeatMinutes * 60000;
const MAX_ACTIVE = config.limits.maxActive;
const PID_FILE = join(dirname(STATE_PATH), "watch.pid");
// Written by `stop`, removed by `start` (bin/control.mjs).
const STOP_FILE = join(dirname(STATE_PATH), "stopped");
// The day of the last morning digest (YYYY-MM-DD, local time), so it wakes once a day.
const DIGEST_FILE = join(dirname(STATE_PATH), "digest-day");

function digestDue() {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (now.getHours() < config.watcher.digestHour) return false;
  if (existsSync(DIGEST_FILE) && readFileSync(DIGEST_FILE, "utf8").trim() === day) return false;
  writeFileSync(DIGEST_FILE, day);
  return true;
}

function stopped() {
  console.log("STOPPED: the factory was stopped (`stop`). Do not start the watcher again; end your turn. `start` clears this.");
  rmSync(PID_FILE, { force: true });
  process.exit(3);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const poll = () => JSON.parse(execFileSync("node", [join(HERE, "events.mjs")], { encoding: "utf8" }));

function alreadyRunning() {
  if (!existsSync(PID_FILE)) return false;
  const pid = Number(readFileSync(PID_FILE, "utf8"));
  try {
    process.kill(pid, 0);
    return pid !== process.pid;
  } catch {
    return false;
  }
}

function issueReasons(key, t, e) {
  const r = [];
  if (!e.workspacePath) r.push(`${key}: workspace still starting`);
  if (Object.keys(t.newResults).length) r.push(`${key}: new result from ${Object.keys(t.newResults).join(", ")}`);
  if (t.feedback.length) r.push(`${key}: ${t.feedback.length} human comment(s)`);
  if (t.pr && ["MERGED", "CLOSED"].includes(t.pr.state)) r.push(`${key}: PR ${t.pr.state.toLowerCase()}`);
  if (t.guard === "closed") r.push(`${key}: issue closed`);
  if (t.guard === "reassigned") r.push(`${key}: reassigned to ${t.assignees.join(", ")}`);
  if (t.guard === "unassigned") r.push(`${key}: nobody assigned`);
  if (t.guard === "paused") r.push(`${key}: paused by a human`);
  if (t.guard === "resumed") r.push(`${key}: resumed`);
  if (t.guard === "drift") r.push(`${key}: labels are [${t.statusLabels.join(", ")}], expected "${expectedStatus(e.phase)}"`);
  if (e.phase === "awaiting_ci" && t.pr?.checks.status !== "pending") r.push(`${key}: CI ${t.pr?.checks.status}`);
  if (e.phase === "ready" && t.pr && t.pr.headSha !== e.headSha) r.push(`${key}: new commits after ready`);
  return r;
}

function reasons(p, state) {
  const r = [];
  const active = Object.values(state.issues).filter((e) => ACTIVE_PHASES.has(e.phase)).length;
  if (p.newIssues.length && active < MAX_ACTIVE) r.push(`new: ${p.newIssues.map((i) => i.key).join(", ")}`);
  for (const [key, t] of Object.entries(p.tracked)) r.push(...issueReasons(key, t, state.issues[key]));
  return r;
}

function wake(why, p) {
  console.log(`WAKE: ${why.join(" | ")}`);
  console.log("Run one Coordinator tick (conductorfactory/prompts/coordinator.md) with this poll, then start the watcher again.");
  if (p) console.log(JSON.stringify(p));
  rmSync(PID_FILE, { force: true });
  process.exit(0);
}

async function main() {
  if (existsSync(STOP_FILE)) stopped();
  process.on("SIGTERM", stopped);
  if (alreadyRunning()) {
    console.log(`WATCHER ALREADY RUNNING (pid ${readFileSync(PID_FILE, "utf8")}); not starting a second one.`);
    process.exit(2);
  }
  const other = otherHome();
  if (other) {
    console.log(`ANOTHER FACTORY HOME IS RUNNING for this login and repository (${other.path}). Stop it there (run stop) before starting this one. Do not start the watcher again; tell the human and end your turn.`);
    process.exit(4);
  }
  takeLock();
  mkdirSync(dirname(PID_FILE), { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
  const started = Date.now();
  let failures = 0;
  for (;;) {
    try {
      const p = poll();
      failures = 0;
      const why = reasons(p, readState());
      if (why.length) wake(why, p);
    } catch (err) {
      // GitHub or the network is down: an agent woken now would fail the same way, so
      // keep polling with backoff (up to 10 minutes) and wake only when there is work.
      failures++;
      console.error(`poll failed (${failures}): ${String(err.message).slice(0, 300)}`);
    }
    if (existsSync(STOP_FILE)) stopped();
    if (failures === 0 && digestDue()) wake(["digest: post the morning digest and cleanup (section G)"], null);
    // The heartbeat lets the Coordinator check session health; with nothing in
    // flight there are no sessions to check, so it never wakes an idle factory.
    const inFlight = Object.values(readState().issues).some((e) => ACTIVE_PHASES.has(e.phase));
    if (failures === 0 && inFlight && Date.now() - started >= HEARTBEAT_MS) wake(["heartbeat: check session states (section C)"], null);
    await sleep(failures ? Math.min(POLL_MS * 2 ** failures, 600000) : POLL_MS);
  }
}

main();

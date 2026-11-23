#!/usr/bin/env node
// Start, stop and inspect the factory in this Factory home. Prints JSON.
//
//   status   is it stopped, is the watcher running, and where each issue is
//   stop     stop the factory: the watcher ends and refuses to start again, so the
//            Coordinator routes nothing further. Sessions finish their current turn.
//   start    check the setup, clear the stop flag, and print the one message that
//            starts the Coordinator chat (the Coordinator then starts the watcher)

import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { FACTORY_DIR, FACTORY_HOME, FINAL_PHASES, config } from "./lib/config.mjs";
import { ensureAllLabels } from "./lib/github-client.mjs";
import { STATE_PATH, readState } from "./lib/state-store.mjs";

const DIR = dirname(STATE_PATH);
export const STOP_FILE = join(DIR, "stopped");
const PID_FILE = join(DIR, "watch.pid");

function watcherPid() {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number(readFileSync(PID_FILE, "utf8"));
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function status() {
  const issues = Object.values(readState().issues)
    .filter((e) => !FINAL_PHASES.has(e.phase))
    .map((e) => ({ issue: e.key, title: e.title, phase: config.phases[e.phase]?.label ?? e.phase, round: e.round, pr: e.prUrl ?? null, workspace: e.workspaceUrl ?? null }));
  return { factoryHome: FACTORY_HOME, stopped: existsSync(STOP_FILE), watcherPid: watcherPid(), queueLabel: config.github.queueLabel, issues };
}

const commands = {
  status,
  stop() {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(STOP_FILE, `${new Date().toISOString()}\n`);
    const pid = watcherPid();
    if (pid) process.kill(pid, "SIGTERM");
    return { ...status(), watcherPid: null, stoppedWatcher: pid };
  },
  start() {
    const rules = join(FACTORY_DIR, "project.md");
    if (!existsSync(rules)) throw new Error("conductorfactory/project.md is missing: write this repository's rules first");
    if (/\bTODO\b/.test(readFileSync(rules, "utf8"))) throw new Error("conductorfactory/project.md still has a TODO: fill it in first");
    ensureAllLabels();
    rmSync(STOP_FILE, { force: true });
    const s = status();
    const prompt = join(FACTORY_DIR, "prompts", "coordinator.md");
    return {
      ...s,
      coordinator: s.watcherPid ? "already running in this Factory home" : "not running",
      coordinatorMessage: `Start the factory Coordinator: read ${prompt} and follow it.`,
      next: s.watcherPid
        ? "Nothing to do."
        : "Send coordinatorMessage as the first message of a new Conductor chat in this workspace, then add the queue label to an issue.",
    };
  },
};

const cmd = process.env.FACTORY_COMMAND;
try {
  if (commands[cmd]) console.log(JSON.stringify(commands[cmd](), null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

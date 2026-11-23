#!/usr/bin/env node
// The factory's one entry point. conductorfactory/run calls it with FACTORY_HOME
// set, so every session reads the same settings and state:
//
//   <Factory home>/conductorfactory/run <command> [args…]
//
// Commands: config, issue, pr, state, events, watch, commit, gh, labels, and
// start, stop, status (bin/control.mjs).
// Run it from the checkout the command should act on (git and gh use the cwd).

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COMMANDS = ["config", "issue", "pr", "state", "events", "watch", "commit", "gh", "labels", "start", "stop", "status"];
const CONTROL = ["start", "stop", "status"];
const [command] = process.argv.splice(2, 1);
if (CONTROL.includes(command)) process.env.FACTORY_COMMAND = command;
const file = join(dirname(fileURLToPath(import.meta.url)), `${CONTROL.includes(command) ? "control" : command}.mjs`);

if (!COMMANDS.includes(command) || !existsSync(file)) {
  console.error(`usage: run <${COMMANDS.join("|")}> …`);
  process.exit(2);
}
await import(file);

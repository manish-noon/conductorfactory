#!/usr/bin/env node
// Installs the factory into a repository, or updates it. Run it from anywhere
// in the checkout:
//
//   node <skill>/setup.mjs
//
// Copies conductorfactory/ (launcher, scripts, prompts, default settings) into
// the repository, replacing those files with this skill's version, and adds
// the repository's own files from templates/ only when they are missing:
// conductorfactory/config.json, conductorfactory/project.md and FACTORY.md.
// After this the repository runs the factory without the skill installed.

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = dirname(fileURLToPath(import.meta.url));
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const target = join(root, "conductorfactory");

// The factory's own code: always this skill's version.
for (const part of ["bin", "prompts"]) rmSync(join(target, part), { recursive: true, force: true });
cpSync(join(SKILL, "conductorfactory"), target, { recursive: true });
chmodSync(join(target, "run"), 0o755);
console.log("updated  conductorfactory/run, bin/, prompts/, config.default.json");

// The repository's own files: never overwritten.
const own = [
  ["config.json", join(target, "config.json"), "conductorfactory/config.json"],
  ["project.md", join(target, "project.md"), "conductorfactory/project.md"],
  ["FACTORY.md", join(root, "FACTORY.md"), "FACTORY.md"],
];
const existing = new Set();
for (const [from, dest, name] of own) {
  if (existsSync(dest)) {
    existing.add(name);
    console.log(`kept     ${name}`);
    continue;
  }
  copyFileSync(join(SKILL, "templates", from), dest);
  console.log(`created  ${name}`);
}

const fresh = (name) => !existing.has(name);
const todo = existsSync(join(target, "project.md")) && /\bTODO\b/.test(readFileSync(join(target, "project.md"), "utf8"));

console.log(`
The factory is installed in conductorfactory/. What to do next:

  ${todo ? "1. Fill in conductorfactory/project.md (it still has TODOs): this repository's checks,\n     how tests run, when to plan first, what blocks a review, what never to do." : "1. conductorfactory/project.md is filled in. Read it once: it is what the agents will follow."}
  2. Add the Factory section to README.md${fresh("FACTORY.md") ? " (FACTORY.md was just created; the README should point to it)" : " if it is not there yet"}.
  3. Commit conductorfactory/, FACTORY.md and README.md, so every workspace has them.
  4. Start it, from a Conductor workspace of this repository:

       conductorfactory/run start

     It creates the labels on GitHub, checks the setup and prints a coordinatorMessage.
     Send that message as the first message of a new chat in the same workspace: that chat
     becomes the Coordinator. Keep the workspace and keep Conductor open.
  5. Give it work: add the factory:queue label to a GitHub issue (how to write one: FACTORY.md).

  Later:  conductorfactory/run status   where each issue is
          conductorfactory/run stop     stop routing work; start continues where it stopped

  Handing tasks to an assistant? One standing instruction is enough:
    "When I give you a task for a repo, follow its README to queue it, and tell me only when I'm needed."
  An assistant without a command line (instinct, for example) must be signed in to GitHub in its browser.`);

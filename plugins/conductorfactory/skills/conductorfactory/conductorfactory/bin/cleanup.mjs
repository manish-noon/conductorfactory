#!/usr/bin/env node
// Finds Conductor workspaces whose pull request is merged or closed, in any
// repository. Conductor's workspace list is only visible to an agent, so the
// Coordinator passes it in (ListWorkspaces across every repository, as JSON):
//
//   cleanup '<json array of {id, name, branch, path}>'   or   cleanup - (stdin)
//
// Prints { message, archive: [ids] }. message is a boxed table for the chat; the
// Coordinator shows it, asks, and archives only on the human's yes. The Factory
// home, workspaces without a PR, and workspaces with uncommitted changes or
// commits newer than the PR are never offered for archiving.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { FACTORY_HOME } from "./lib/config.mjs";
import { GH_ENV } from "./lib/github-client.mjs";
import { ICON, box } from "./lib/box.mjs";

const arg = process.argv[2];
const workspaces = JSON.parse(arg === "-" || !arg ? readFileSync(0, "utf8") : arg);

function prFor(ws) {
  try {
    const out = execFileSync("gh", ["pr", "list", "--head", ws.branch, "--state", "all", "--limit", "1", "--json", "number,state,url,headRefOid"], { cwd: ws.path, encoding: "utf8", env: GH_ENV, stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(out)[0] ?? null;
  } catch {
    return null;
  }
}

function repoName(path) {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: path, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return basename(url).replace(/\.git$/, "");
  } catch {
    return "?";
  }
}

const git = (path, args) => execFileSync("git", args, { cwd: path, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

// Work that would be lost: uncommitted changes, or commits newer than the PR.
function unsaved(ws, pr) {
  try {
    if (git(ws.path, ["status", "--porcelain"])) return "uncommitted changes";
    if (git(ws.path, ["rev-parse", "HEAD"]) !== pr.headRefOid) return "commits after the PR";
    return null;
  } catch {
    return "git unreadable";
  }
}

const found = [];
const kept = [];
for (const ws of workspaces) {
  if (!ws.branch || !ws.path || ws.path === FACTORY_HOME || !existsSync(ws.path)) continue;
  const pr = prFor(ws);
  if (!pr || !["MERGED", "CLOSED"].includes(pr.state)) continue;
  const why = unsaved(ws, pr);
  (why ? kept : found).push({ ws, pr, why, repo: repoName(ws.path) });
}

const keptNote = kept.length
  ? `\n${ICON.info} Kept, PR finished but work would be lost: ${kept.map(({ ws, why }) => `${ws.name} (${why})`).join("; ")}.`
  : "";
if (!found.length) {
  console.log(JSON.stringify({ message: `${ICON.done} Nothing to clean up: no workspace has a merged or closed PR.${keptNote}`, archive: [] }));
  process.exit(0);
}
const rows = [["", "Repo", "Workspace", "PR"], ...found.map(({ ws, pr, repo }) => [pr.state === "MERGED" ? ICON.done : ICON.fail, repo, ws.name.slice(0, 40), `#${pr.number} ${pr.state === "MERGED" ? "merged" : "closed"}`])];
const message = `${box(`Cleanup: ${found.length} workspace(s) are finished`, rows)}\n${ICON.action} Reply **archive all**, or name the ones to keep. Archiving removes the local worktree; the branch and PR stay on GitHub.${keptNote}`;
console.log(JSON.stringify({ message, archive: found.map(({ ws }) => ws.id) }));

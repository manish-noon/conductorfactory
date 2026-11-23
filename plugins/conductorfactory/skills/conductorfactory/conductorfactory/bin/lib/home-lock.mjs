// One Coordinator per GitHub login and repository on this machine. The lock
// lives outside any checkout so every worktree of the repository sees it.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FACTORY_HOME, HOME_ID } from "./config.mjs";
import { repoName, viewer } from "./github-client.mjs";

const DIR = join(homedir(), ".conductorfactory", "locks");
const FRESH_MS = 10 * 60000;

const lockFile = () => join(DIR, `${createHash("sha1").update(`${repoName()}:${viewer()}`).digest("hex").slice(0, 16)}.json`);

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Another Factory home of this login that is running here, or null.
export function otherHome() {
  const file = lockFile();
  if (!existsSync(file)) return null;
  const lock = JSON.parse(readFileSync(file, "utf8"));
  if (lock.home === HOME_ID) return null;
  const live = alive(lock.pid) || Date.now() - Date.parse(lock.at) < FRESH_MS;
  return live ? lock : null;
}

export function takeLock() {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(lockFile(), JSON.stringify({ home: HOME_ID, path: FACTORY_HOME, pid: process.pid, at: new Date().toISOString() }));
}

export function dropLock() {
  const file = lockFile();
  if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).home === HOME_ID) rmSync(file, { force: true });
}

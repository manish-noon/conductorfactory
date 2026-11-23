#!/usr/bin/env node
// git commit for factory sessions: same arguments as `git commit`. Adds the
// factory trailer (identity.commitTrailer), which is how the factory tells its
// own commits from a human's push, and commits as identity.commitName /
// identity.commitEmail when they are set (otherwise as the git user).

import { spawnSync } from "node:child_process";
import { config } from "./lib/config.mjs";

const { commitName, commitEmail, commitTrailer } = config.identity;
const identity = [];
if (commitName) identity.push("-c", `user.name=${commitName}`);
if (commitEmail) identity.push("-c", `user.email=${commitEmail}`);
const args = [...identity, "commit", "--trailer", commitTrailer, ...process.argv.slice(2)];
process.exit(spawnSync("git", args, { stdio: "inherit" }).status ?? 1);

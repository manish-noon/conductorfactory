#!/usr/bin/env node
// gh for factory sessions: the same arguments as gh, with the environment the
// factory's own scripts use (GH_HOST dropped when github.dropGhHost is set).

import { spawnSync } from "node:child_process";
import { GH_ENV } from "./lib/github-client.mjs";

process.exit(spawnSync("gh", process.argv.slice(2), { stdio: "inherit", env: GH_ENV }).status ?? 1);

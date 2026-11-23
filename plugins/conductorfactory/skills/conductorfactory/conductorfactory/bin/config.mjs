#!/usr/bin/env node
// Read factory settings (defaults merged with the repository's conductorfactory/config.json).
//
//   config                 the whole config as JSON
//   config <dot.path>      one value: strings and numbers print bare, objects as JSON
//                          e.g. config git.baseBranch → main

import { config, getPath } from "./lib/config.mjs";
import { baseBranch } from "./lib/github-client.mjs";

const [path] = process.argv.slice(2);
// git.baseBranch null means the repository's default branch; resolve it for the reader.
const resolved = { ...config, git: { ...config.git, baseBranch: config.git.baseBranch ?? baseBranch() } };
const value = path ? getPath(resolved, path) : resolved;
if (value === undefined || value === null) {
  console.error(`No setting ${path} in the factory config`);
  process.exit(1);
}
console.log(typeof value === "object" ? JSON.stringify(value, null, 2) : String(value));

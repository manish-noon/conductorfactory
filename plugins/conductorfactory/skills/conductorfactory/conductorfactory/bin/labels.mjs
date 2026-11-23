#!/usr/bin/env node
// Creates (or updates) every label the factory uses in the repository: the
// queue and pause labels, one per phase status, needs-human, outcome and size.
// Safe to run again.

import { ensureAllLabels } from "./lib/github-client.mjs";

try {
  console.log(JSON.stringify({ ok: true, labels: ensureAllLabels() }, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

#!/usr/bin/env node
// Factory pull request CLI. Prints JSON.
//
//   pr comment <PR> <file.md>      post a PR comment (factory prefix added)
//   pr feedback <PR> [sinceISO]    human comments/reviews since a time (default: 7 days)
//   pr show <PR>                   state, head sha, CI summary, human commit count
//   pr label <PR> <label>          add a label (created if missing)
//   pr unlabel <PR> <label>        remove a label

import { readFileSync } from "node:fs";
import { addLabel, listPrFeedback, readPr, removeLabel, upsertComment } from "./lib/github-client.mjs";

const WEEK_AGO = () => new Date(Date.now() - 7 * 86400000).toISOString();

const commands = {
  comment: ([pr, file]) => upsertComment(pr, readFileSync(file, "utf8")),
  feedback: ([pr, since]) => listPrFeedback(pr, since ?? WEEK_AGO()),
  show: ([pr]) => readPr(pr),
  label: ([pr, label]) => (addLabel(pr, label), { ok: true, pr, label }),
  unlabel: ([pr, label]) => (removeLabel(pr, label), { ok: true, pr, label }),
};

const [cmd, ...args] = process.argv.slice(2);
try {
  if (!commands[cmd]) throw new Error(`usage: pr <${Object.keys(commands).join("|")}> …`);
  console.log(JSON.stringify(commands[cmd](args), null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

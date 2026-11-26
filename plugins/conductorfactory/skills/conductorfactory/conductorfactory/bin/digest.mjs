#!/usr/bin/env node
// The morning digest: every tracked issue that is waiting on the human, as a
// boxed table with what to do next. Prints { message, waiting } (waiting: count).
// The watcher wakes the Coordinator for it once a day at watcher.digestHour.

import { config } from "./lib/config.mjs";
import { readState } from "./lib/state-store.mjs";
import { ICON, box } from "./lib/box.mjs";

const NEXT = {
  planning: "Answer the plan questions on the issue",
  ready: "Review and approve the PR",
  needs_human: "Take over: read the escalation on the issue",
  paused: "Add the queue label to resume, or close it",
};

const state = readState();
const rows = [["", "Issue", "Title", "What you need to do"]];
const links = [];
for (const [key, e] of Object.entries(state.issues)) {
  if (!NEXT[e.phase]) continue;
  const link = e.phase === "ready" && e.prUrl ? e.prUrl : e.url ?? `#${key}`;
  rows.push([ICON.action, `#${key}`, String(e.title ?? "").slice(0, 32), NEXT[e.phase]]);
  links.push(`[#${key}](${link})`);
}
const working = Object.values(state.issues).filter((e) => config.phases[e.phase]?.active).length;
const waiting = rows.length - 1;
const head = `Factory morning digest: ${waiting} waiting on you, ${working} being worked on`;
// Links go under the box: a link inside the code block is not clickable.
const message = waiting ? `${box(head, rows)}\nOpen: ${links.join(" · ")}` : `${ICON.done} ${head}. Nothing needs you today.`;
console.log(JSON.stringify({ message, waiting }));

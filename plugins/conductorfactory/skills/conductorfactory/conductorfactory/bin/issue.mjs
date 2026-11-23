#!/usr/bin/env node
// Factory issue CLI: everything the factory reads from and writes to a GitHub
// issue. Every command prints JSON on stdout.
//
//   issue show <N>                          title, body, labels and human comments
//   issue queue                             open issues carrying the queue label
//   issue status <N> <label>                set the one factory status label
//   issue size <N> <S|M|L|XL>               set the size label
//   issue outcome <N> <autonomous|assisted> add the outcome label
//   issue assign-me <N>                     assign to the gh user
//   issue assign <N> <login>                hand it to another owner (their factory takes it over)
//   issue owner <N>                         whose factory this issue belongs to, and whether it is this one
//   issue comment <N> <file.md> [commentId] create, or edit in place
//   issue evidence <N> <summary.md> <file>… post the evidence summary; images and videos are
//                                           uploaded and shown inline, other files listed by path

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./lib/config.mjs";
import {
  addLabel,
  assignTo,
  assignToMe,
  canAttach,
  commentWithFiles,
  getIssue,
  isMedia,
  listIssueFeedback,
  listQueue,
  setPrefixedLabel,
  setStatus,
  upsertComment,
  viewer,
} from "./lib/github-client.mjs";
import { ownerOf } from "./lib/ownership.mjs";
import { readRunState } from "./lib/run-state.mjs";

// Files that are not uploaded (logs, reports, or everything when gh is too old
// for --attach) stay in the workspace; the comment says where.
function evidenceMarkdown(summary, local) {
  if (!local.length) return summary.trim();
  const lines = [summary.trim(), "", "Other evidence files (on the factory machine, in the issue's workspace):"];
  for (const f of local) lines.push(`- \`${resolve(f)}\``);
  return lines.join("\n");
}

const commands = {
  // Human comments are part of the ask: clarifications and planning answers.
  show([key]) {
    const { statusLabels, ...issue } = getIssue(key);
    return { ...issue, comments: listIssueFeedback(key, new Date(0).toISOString()) };
  },
  queue: () => listQueue().map(({ body, ...rest }) => rest),
  status([key, label]) {
    setStatus(key, label);
    return { ok: true, key, status: label };
  },
  size([key, size]) {
    setPrefixedLabel(key, config.github.sizeLabelPrefix, size);
    return { ok: true, key, label: `${config.github.sizeLabelPrefix}${size}` };
  },
  outcome([key, outcome]) {
    const label = config.github.outcomeLabels[outcome];
    if (!label) throw new Error(`Unknown outcome ${outcome}`);
    addLabel(key, label);
    return { ok: true, key, label };
  },
  "assign-me"([key]) {
    assignToMe(key);
    return { ok: true, key };
  },
  assign([key, login]) {
    if (!login) throw new Error("usage: issue assign <N> <login>");
    assignTo(key, login.replace(/^@/, ""));
    return { ok: true, key, owner: login.replace(/^@/, "") };
  },
  owner([key]) {
    const issue = getIssue(key);
    const owner = ownerOf(issue);
    return { key, owner, mine: owner === viewer(), assignees: issue.assignees, run: readRunState(key) };
  },
  comment([key, file, commentId]) {
    const c = upsertComment(key, readFileSync(file, "utf8"), commentId);
    return { ok: true, key, commentId: c.id, url: c.url };
  },
  evidence([key, summaryFile, ...files]) {
    const missing = files.filter((f) => !existsSync(f));
    if (missing.length) throw new Error(`No such evidence file: ${missing.join(", ")}`);
    if (files.length > config.limits.maxEvidenceFiles) throw new Error(`At most ${config.limits.maxEvidenceFiles} evidence files`);
    const upload = config.evidence.attach && canAttach() ? files.filter(isMedia) : [];
    const local = files.filter((f) => !upload.includes(f));
    const body = evidenceMarkdown(readFileSync(summaryFile, "utf8"), local);
    const c = upload.length ? commentWithFiles(key, body, upload) : upsertComment(key, body);
    return { ok: true, key, commentId: c.id, url: c.url, uploaded: upload, local: local.map((f) => resolve(f)) };
  },
};

const [cmd, ...args] = process.argv.slice(2);
try {
  if (!commands[cmd]) throw new Error(`usage: issue <${Object.keys(commands).join("|")}> …`);
  console.log(JSON.stringify(commands[cmd](args), null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

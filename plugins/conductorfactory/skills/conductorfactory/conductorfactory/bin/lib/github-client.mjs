// GitHub access for the factory, through the gh CLI (already authenticated, so
// the factory needs no API key or .env). Issues carry the factory's state as
// labels; issue comments carry status, questions and evidence; the PR carries
// the code review. Run from a checkout of the repository: gh resolves
// {owner}/{repo} from its remote.

import { execFileSync } from "node:child_process";
import { STATUS_LABELS, config } from "./config.mjs";
import { isFactory, withPrefix } from "./prefix.mjs";

const ENV = { ...process.env };
if (config.github.dropGhHost) delete ENV.GH_HOST;
export const GH_ENV = ENV;

function ghText(args, input) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", env: ENV, input, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (err) {
    throw new Error(`gh ${args.slice(0, 3).join(" ")}: ${String(err.stderr || err.message).trim().slice(0, 400)}`);
  }
}

export function gh(args, input) {
  const out = ghText(args, input);
  return out ? JSON.parse(out) : null;
}

export const api = (path) => gh(["api", `repos/{owner}/{repo}/${path}`]);
// Every page of a list endpoint, as one array.
export const apiAll = (path) => gh(["api", "--paginate", "--slurp", `repos/{owner}/{repo}/${path}`]).flat();

let login;
// The GitHub login this factory acts as.
export function viewer() {
  login ??= ghText(["api", "user", "--jq", ".login"]);
  return login;
}

export const repoName = () => gh(["repo", "view", "--json", "nameWithOwner"]).nameWithOwner;

let defaultBranch;
export function baseBranch() {
  if (config.git.baseBranch) return config.git.baseBranch;
  defaultBranch ??= gh(["repo", "view", "--json", "defaultBranchRef"]).defaultBranchRef.name;
  return defaultBranch;
}

// ---- issues ---------------------------------------------------------------

const ISSUE_FIELDS = "number,title,url,state,stateReason,body,labels,assignees";

const slug = (title) =>
  title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");

function summarize(i) {
  const labels = i.labels.map((l) => l.name);
  return {
    key: String(i.number),
    title: i.title,
    url: i.url,
    branchName: `${config.git.branchPrefix}${i.number}-${slug(i.title)}`,
    state: i.state,
    stateReason: i.stateReason ?? null,
    labels,
    assignees: (i.assignees ?? []).map((a) => a.login),
    statusLabels: labels.filter((l) => STATUS_LABELS.has(l)),
    body: i.body ?? "",
  };
}

export const getIssue = (key) => summarize(gh(["issue", "view", String(key), "--json", ISSUE_FIELDS]));

// Open issues carrying the queue label.
export function listQueue() {
  const label = config.github.queueLabel;
  return gh(["issue", "list", "--label", label, "--state", "open", "--limit", "50", "--json", ISSUE_FIELDS]).map(summarize);
}

// Open issues assigned to this login (runs handed over from another owner show up here).
export function listAssignedToMe() {
  return gh(["issue", "list", "--assignee", "@me", "--state", "open", "--limit", "100", "--json", ISSUE_FIELDS]).map(summarize);
}

function editLabels(key, add, remove) {
  const args = ["issue", "edit", String(key)];
  if (add.length) args.push("--add-label", add.join(","));
  if (remove.length) args.push("--remove-label", remove.join(","));
  if (args.length > 3) ghText(args);
}

// Sets the one factory status label, removing every other one the issue has.
export function setStatus(key, label) {
  const issue = getIssue(key);
  const remove = issue.statusLabels.filter((l) => l !== label);
  editLabels(key, issue.labels.includes(label) ? [] : [label], remove);
}

export function ensureLabel(name, color = config.github.labelColor, description = "Set by the factory") {
  ghText(["label", "create", name, "--color", color, "--description", description, "--force"]);
}

// Sets exactly one label with this prefix (e.g. size:M), creating it if needed.
export function setPrefixedLabel(key, prefix, value) {
  const label = `${prefix}${value}`;
  ensureLabel(label);
  const issue = getIssue(key);
  editLabels(key, issue.labels.includes(label) ? [] : [label], issue.labels.filter((l) => l.startsWith(prefix) && l !== label));
}

// Label an issue or a PR (they share the labels API), creating the label if needed.
export function addLabel(number, label) {
  ensureLabel(label);
  gh(["api", `repos/{owner}/{repo}/issues/${number}/labels`, "--input", "-"], JSON.stringify({ labels: [label] }));
}

export function removeLabel(number, label) {
  const has = api(`issues/${number}/labels?per_page=100`).some((l) => l.name === label);
  if (has) ghText(["api", "-X", "DELETE", `repos/{owner}/{repo}/issues/${number}/labels/${encodeURIComponent(label)}`]);
}

export const assignToMe = (key) => void ghText(["issue", "edit", String(key), "--add-assignee", "@me"]);

// Hand an issue to another owner: they become the only assignee.
export function assignTo(key, login) {
  const others = getIssue(key).assignees.filter((l) => l !== login);
  const args = ["issue", "edit", String(key), "--add-assignee", login];
  if (others.length) args.push("--remove-assignee", others.join(","));
  ghText(args);
}

// Every label the factory uses, created (or updated) in the repository.
export function ensureAllLabels() {
  const g = config.github;
  const made = [];
  for (const name of STATUS_LABELS) {
    if (name === g.needsHumanLabel) continue;
    const about = name === g.queueLabel ? "Add to hand this issue to the factory" : name === g.pauseLabel ? "Add to pause the factory on this issue" : "Factory status";
    ensureLabel(name, g.labelColor, about);
    made.push(name);
  }
  ensureLabel(g.needsHumanLabel, g.needsHumanLabelColor, "The factory stopped: a human takes over");
  made.push(g.needsHumanLabel);
  for (const name of Object.values(g.outcomeLabels)) (ensureLabel(name, g.labelColor, "How a factory issue shipped"), made.push(name));
  for (const size of [...Object.keys(config.sizes), "XL"]) {
    ensureLabel(`${g.sizeLabelPrefix}${size}`, g.labelColor, "Factory size estimate");
    made.push(`${g.sizeLabelPrefix}${size}`);
  }
  return made;
}

// ---- comments (an issue and a PR share the same comment API) ---------------

// Creates a comment on an issue or PR, or edits commentId in place. Always
// prefixed, so it is never mistaken for human feedback. Returns { id, url }.
export function upsertComment(number, rawBody, commentId) {
  const payload = JSON.stringify({ body: withPrefix(rawBody) });
  const c = commentId
    ? gh(["api", "-X", "PATCH", `repos/{owner}/{repo}/issues/comments/${commentId}`, "--input", "-"], payload)
    : gh(["api", `repos/{owner}/{repo}/issues/${number}/comments`, "--input", "-"], payload);
  return { id: String(c.id), url: c.html_url };
}

const MEDIA = /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm)$/i;
export const isMedia = (file) => MEDIA.test(file);

let attachSupported;
// `--attach` uploads images and videos to a comment; older gh versions lack it.
export function canAttach() {
  attachSupported ??= ghText(["issue", "comment", "--help"]).includes("--attach");
  return attachSupported;
}

// Posts a new prefixed comment on an issue or PR with images and videos
// uploaded and shown inline (gh --attach). Returns { id, url }.
export function commentWithFiles(number, rawBody, files) {
  const args = ["issue", "comment", String(number), "--body-file", "-"];
  for (const f of files) args.push("--attach", f);
  const url = ghText(args, withPrefix(rawBody)).split("\n").find((l) => l.includes("#issuecomment-")) ?? "";
  return { id: url.split("#issuecomment-")[1] ?? null, url };
}

const toFeedback = (source, kind, c, createdAt) => ({
  source,
  kind,
  id: String(c.id),
  author: c.user?.login,
  createdAt,
  url: c.html_url,
  path: c.path ?? undefined,
  line: c.line ?? c.original_line ?? undefined,
  state: c.state ?? undefined,
  body: c.body ?? "",
});

const isHuman = (f) => !isFactory(f.body) && !f.author?.endsWith("[bot]");
const after = (since) => (f) => Date.parse(f.createdAt) > Date.parse(since);
const byTime = (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt);

// Human comments on an issue since `since` (ISO), oldest first. Excludes
// factory posts and bots.
export function listIssueFeedback(key, since) {
  const q = `?per_page=100&since=${encodeURIComponent(since)}`;
  return apiAll(`issues/${key}/comments${q}`)
    .map((c) => toFeedback("issue", "comment", c, c.created_at))
    .filter(after(since))
    .filter(isHuman)
    .sort(byTime);
}

// Human feedback on a PR since `since`: conversation comments, inline review
// comments and review summaries.
export function listPrFeedback(number, since) {
  const q = `?per_page=100&since=${encodeURIComponent(since)}`;
  return [
    ...apiAll(`issues/${number}/comments${q}`).map((c) => toFeedback("pr", "comment", c, c.created_at)),
    ...apiAll(`pulls/${number}/comments${q}`).map((c) => toFeedback("pr", "inline", c, c.created_at)),
    ...apiAll(`pulls/${number}/reviews?per_page=100`)
      .filter((r) => r.body?.trim())
      .map((r) => toFeedback("pr", "review", r, r.submitted_at)),
  ]
    .filter(after(since))
    .filter(isHuman)
    .sort(byTime);
}

// ---- pull requests --------------------------------------------------------

const FAILED = new Set(["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"]);

function summarizeChecks(rollup = []) {
  if (!rollup.length) return { status: "none", failing: [] };
  const failing = rollup.filter((c) => FAILED.has(c.conclusion ?? c.state)).map((c) => c.name ?? c.context);
  const pending = rollup.some((c) =>
    c.__typename === "CheckRun" ? c.status !== "COMPLETED" : ["PENDING", "EXPECTED"].includes(c.state),
  );
  return { status: failing.length ? "failure" : pending ? "pending" : "success", failing };
}

// A factory commit carries identity.commitTrailer (added by `commit`) or is
// authored by identity.commitEmail; anything else was pushed by a human.
function isFactoryCommit(c) {
  const trailer = config.identity.commitTrailer.toLowerCase();
  const email = config.identity.commitEmail?.toLowerCase();
  if (`${c.messageBody ?? ""}`.toLowerCase().includes(trailer)) return true;
  return Boolean(email) && (c.authors ?? []).some((a) => a.email?.toLowerCase() === email);
}

export function readPr(number) {
  const fields = "state,isDraft,headRefOid,mergedAt,url,statusCheckRollup,commits";
  const pr = gh(["pr", "view", String(number), "--json", fields]);
  return {
    state: pr.state,
    isDraft: pr.isDraft,
    headSha: pr.headRefOid,
    mergedAt: pr.mergedAt,
    url: pr.url,
    checks: summarizeChecks(pr.statusCheckRollup),
    humanCommits: pr.commits.filter((c) => !isFactoryCommit(c)).length,
  };
}

// Reads a Conductor session's Claude Code transcript and returns its token
// usage, cost and how many messages a human typed into it. No hooks needed:
// Claude Code writes ~/.claude/projects/<workspace path, non-alphanumerics as
// "-">/<Conductor session id>.jsonl, plus <session id>/subagents/*.jsonl.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { config } from "./config.mjs";
import { priceTokens } from "./prices.mjs";

const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
// Every message the Coordinator sends starts with this; anything else typed is a human.
export const COORDINATOR_MARK = config.identity.coordinatorMark;

const projectDir = (workspacePath) => join(CONFIG_DIR, "projects", workspacePath.replace(/[^a-zA-Z0-9]/g, "-"));

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function transcriptFiles(workspacePath, sessionId) {
  const dir = projectDir(workspacePath);
  const subDir = join(dir, sessionId, "subagents");
  const subs = existsSync(subDir) ? readdirSync(subDir).filter((f) => f.endsWith(".jsonl")) : [];
  return [join(dir, `${sessionId}.jsonl`), ...subs.map((f) => join(subDir, f))];
}

const textOf = (content) =>
  typeof content === "string" ? content : (content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");

// A typed message is human when it has text, is not tool output, and lacks the Coordinator mark.
// isMeta rows are injected by Claude Code itself (e.g. a loaded skill's text), never typed.
function isHumanMessage(row) {
  if (row.type !== "user" || row.isSidechain || row.isMeta) return false;
  const text = textOf(row.message?.content).trim();
  return text.length > 0 && !text.includes(COORDINATOR_MARK) && !text.startsWith("<");
}

// Times the session called an ask-the-user tool (e.g. mcp__conductor__AskUserQuestion).
// Answers come back as tool results, not typed messages, so they need their own count.
function askTimes(rows) {
  const asks = rows.filter(
    (r) => r.type === "assistant" && !r.isSidechain &&
      (r.message?.content ?? []).some((b) => b.type === "tool_use" && /AskUserQuestion$/.test(b.name ?? "")),
  );
  return [...new Set(asks.map((r) => r.message.id))].map((id) => asks.find((r) => r.message.id === id).timestamp);
}

function addUsage(totals, model, u) {
  const t = (totals[model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 });
  const c = u.cache_creation ?? {};
  t.input += u.input_tokens ?? 0;
  t.output += u.output_tokens ?? 0;
  t.cacheRead += u.cache_read_input_tokens ?? 0;
  t.cacheWrite1h += c.ephemeral_1h_input_tokens ?? 0;
  t.cacheWrite5m += c.ephemeral_5m_input_tokens ?? (c.ephemeral_1h_input_tokens ? 0 : u.cache_creation_input_tokens ?? 0);
}

export function sessionUsage(workspacePath, sessionId) {
  const rows = transcriptFiles(workspacePath, sessionId).flatMap(readJsonl);
  // One API response is written as several lines with the same message id: count it once.
  const messages = new Map();
  for (const r of rows) if (r.type === "assistant" && r.message?.usage) messages.set(r.message.id, r.message);
  const tokens = {};
  for (const m of messages.values()) addUsage(tokens, m.model, m.usage);
  let costUSD = 0;
  const unpricedModels = [];
  for (const [model, t] of Object.entries(tokens)) {
    const usd = priceTokens(model, t);
    if (usd === null) unpricedModels.push(model);
    else costUSD += usd;
  }
  const stamps = rows.map((r) => r.timestamp).filter(Boolean).sort();
  return {
    found: rows.length > 0,
    costUSD: Math.round(costUSD * 10000) / 10000,
    apiCalls: messages.size,
    tokens,
    unpricedModels,
    humanMessageTimes: rows.filter(isHumanMessage).map((r) => r.timestamp).filter(Boolean),
    askTimes: askTimes(rows).filter(Boolean),
    firstAt: stamps[0] ?? null,
    lastAt: stamps.at(-1) ?? null,
  };
}

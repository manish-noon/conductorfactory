// Builds the final "factory run" JSON the Coordinator posts on the issue
// when an issue leaves the factory (merged, needs_human, canceled). It answers
// two questions per issue: what did it cost, and did a human have to step in?

import { WAITING_ON_HUMAN_PHASES } from "./config.mjs";
import { phaseDurations } from "./run-comment.mjs";
import { sessionUsage } from "./transcript-usage.mjs";

const minutes = (ms) => Math.round(ms / 60000);
const count = (history, event) => history.filter((h) => h.event === event).length;

// [start, end) windows the issue spent in one phase, from consecutive phase events.
function phaseWindows(history, phase) {
  const phases = history.filter((h) => h.event === "phase");
  return phases
    .map((p, i) => [p, phases[i + 1]])
    .filter(([p]) => p.phase === phase)
    .map(([p, next]) => [Date.parse(p.at), next ? Date.parse(next.at) : Infinity]);
}

// Splits typed messages into planning (requested by the factory) and unprompted interventions.
function splitMessages(times, planning) {
  const inPlanning = (t) => planning.some(([s, e]) => t >= s && t < e);
  const planned = times.filter((t) => inPlanning(Date.parse(t))).length;
  return { planning: planned, unprompted: times.length - planned };
}

function usageByRole(entry) {
  const out = {};
  for (const [role, sessionId] of Object.entries(entry.sessions ?? {})) {
    if (sessionId && entry.workspacePath) out[role] = sessionUsage(entry.workspacePath, sessionId);
  }
  return out;
}

function costSummary(usage) {
  const byRole = {};
  let totalUSD = 0;
  for (const [role, { humanMessageTimes, askTimes, ...rest }] of Object.entries(usage)) {
    byRole[role] = rest;
    totalUSD += rest.costUSD;
  }
  return { totalUSD: Math.round(totalUSD * 100) / 100, byRole };
}

function timeSummary(history) {
  const totals = phaseDurations(history);
  const byPhase = Object.fromEntries([...totals].map(([phase, ms]) => [phase, minutes(ms)]));
  let all = 0;
  let waiting = 0;
  for (const [phase, ms] of totals) {
    all += ms;
    if (WAITING_ON_HUMAN_PHASES.has(phase)) waiting += ms;
  }
  return { totalMinutes: minutes(all), agentMinutes: minutes(all - waiting), waitingOnHumanMinutes: minutes(waiting), byPhase };
}

function humanSummary(entry, usage) {
  const history = entry.history ?? [];
  const phases = new Set(history.filter((h) => h.event === "phase").map((h) => h.phase));
  const planning = phaseWindows(history, "planning");
  const chatMessages = Object.fromEntries(
    Object.entries(usage).map(([role, u]) => [role, splitMessages(u.humanMessageTimes, planning)]),
  );
  const questions = Object.fromEntries(
    Object.entries(usage).map(([role, u]) => [role, splitMessages(u.askTimes, planning)]),
  );
  // Comments forwarded while the issue was in Needs Planning are planning, same as chat messages.
  const feedbackTimes = history.filter((h) => h.event === "feedback").flatMap((h) => Array(h.count ?? 1).fill(h.at));
  const feedbackComments = splitMessages(feedbackTimes, planning);
  const human = {
    planning: phases.has("planning"),
    escalated: phases.has("needs_human"),
    feedbackComments,
    chatMessages,
    questions,
    commits: entry.humanCommits ?? 0,
    statusResets: count(history, "status_reset"),
  };
  // Planning is a checkpoint the factory asked for; only unprompted typing counts as stepping in.
  const unprompted = [...Object.values(chatMessages), ...Object.values(questions), feedbackComments].reduce((n, m) => n + m.unprompted, 0);
  human.interrupted = human.escalated || unprompted > 0 || human.commits > 0;
  return human;
}

export function buildRunMetrics(entry) {
  const history = entry.history ?? [];
  const usage = usageByRole(entry);
  const cost = costSummary(usage);
  const sentBack = {};
  for (const h of history.filter((x) => x.event === "sent_back")) sentBack[h.by] = (sentBack[h.by] ?? 0) + 1;
  return {
    schema: "factory-run/v1",
    issue: entry.key,
    outcome: entry.phase,
    finishedAt: new Date().toISOString(),
    pr: entry.pr ?? null,
    size: entry.size ?? null,
    human: humanSummary(entry, usage),
    rounds: { final: entry.round, sentBack },
    time: timeSummary(history),
    cost,
    sessions: entry.sessions ?? {},
  };
}

export function renderMetricsComment(metrics) {
  const h = metrics.human;
  const verdict = h.interrupted ? "a human stepped in" : "no human intervention";
  return [
    `**Factory run metrics**: ${metrics.outcome} · $${metrics.cost.totalUSD} · ${metrics.time.totalMinutes} min · ${verdict}`,
    ``,
    "```json",
    JSON.stringify(metrics, null, 2),
    "```",
  ].join("\n");
}

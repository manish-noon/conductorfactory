// Renders the single "Factory run" comment the Coordinator keeps edited in
// place on each issue: current phase, round, links, time per phase.

import { FINAL_PHASES, config } from "./config.mjs";

const label = (phase) => config.phases[phase]?.label ?? phase;

function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Sums time spent in each phase from consecutive "phase" events. The clock
// stops at a final phase (phases.*.final).
export function phaseDurations(history, now = Date.now()) {
  const phases = history.filter((h) => h.event === "phase");
  const totals = new Map();
  phases.forEach((p, i) => {
    if (FINAL_PHASES.has(p.phase)) return;
    const end = phases[i + 1] ? Date.parse(phases[i + 1].at) : now;
    totals.set(p.phase, (totals.get(p.phase) ?? 0) + (end - Date.parse(p.at)));
  });
  return totals;
}

export function renderRunComment(entry, maxRounds) {
  const current = entry.phase ? label(entry.phase) : "not started";
  const lines = [
    `**Factory run**`,
    ``,
    `**Now:** ${current} · **Round:** ${entry.round}/${maxRounds}` +
      (entry.lastSentBackBy ? ` · last sent back by ${entry.lastSentBackBy}` : ""),
  ];
  if (entry.lastSentBackReason) lines.push(`> ${entry.lastSentBackReason}`);
  const links = [];
  if (entry.prUrl) links.push(`[PR #${entry.pr}](${entry.prUrl})`);
  if (entry.workspaceUrl) links.push(`[Conductor workspace](${entry.workspaceUrl})`);
  if (links.length) lines.push(``, links.join(" · "));

  const totals = phaseDurations(entry.history ?? []);
  if (totals.size) {
    lines.push(``, `| Phase | Time |`, `|---|---|`);
    let sum = 0;
    for (const [phase, ms] of totals) {
      lines.push(`| ${label(phase)} | ${formatDuration(ms)} |`);
      sum += ms;
    }
    lines.push(`| **Total** | **${formatDuration(sum)}** |`);
  }
  lines.push(``, `_Cost and intervention metrics are posted when the issue leaves the factory._`);
  return lines.join("\n");
}

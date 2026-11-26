// Boxed tables for the Coordinator chat: plain box-drawing characters inside a
// code block, so they line up in any terminal or chat. Icons are single-width
// text symbols, never emoji, so the columns stay aligned.

export const ICON = { action: "→", done: "✓", fail: "✗", wait: "…", info: "•" };

const width = (s) => [...String(s)].length;
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - width(s)));

// title: one line above the table. rows: arrays of cells, first row is the header.
export function box(title, rows) {
  const cols = rows[0].map((_, i) => Math.max(...rows.map((r) => width(r[i] ?? ""))));
  const line = (l, m, r) => l + cols.map((w) => "─".repeat(w + 2)).join(m) + r;
  const row = (r) => "│" + cols.map((w, i) => ` ${pad(r[i] ?? "", w)} `).join("│") + "│";
  const out = [line("┌", "┬", "┐"), row(rows[0]), line("├", "┼", "┤"), ...rows.slice(1).map(row), line("└", "┴", "┘")];
  return ["```", title, ...out, "```"].join("\n");
}

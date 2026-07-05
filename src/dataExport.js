// ---- Data export ----
// One-tap backup of everything the app stores, built from the same in-memory
// data the UI reads through src/storage.js. Pure string builders so they're
// testable; the download plumbing lives in the component.

function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows) {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// Flat spreadsheet of every logged set, sorted by date then slug (set order
// within a session is preserved — loadLogs returns entries insert-ordered).
export function logsToCSV(logs) {
  const rows = [];
  for (const [slug, entries] of Object.entries(logs)) {
    for (const e of entries) rows.push([slug, e.date, e.weight, e.reps, e.effort, e.note]);
  }
  rows.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return toCSV([["exercise_slug", "date", "weight", "reps", "effort", "note"], ...rows]);
}

export function weighInsToCSV(weighIns) {
  return toCSV([["date", "weight_lb"], ...weighIns.map((w) => [w.date, w.weight])]);
}

// Full JSON backup — the groundwork for a future re-import, so it carries a
// format version alongside the raw data.
export function buildExportJSON({ logs, weighIns, plan, exportedAt }) {
  return JSON.stringify({ app: "racked", version: 1, exportedAt, plan, logs, weighIns }, null, 2);
}

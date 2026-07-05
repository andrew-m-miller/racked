import { isTimeBased, isBodyweightEx } from "./planUtils.js";

// ---- Estimated 1RM (e1RM) ----
// Epley formula over each weighted set: weight × (1 + reps/30). A smoother
// progress signal than raw top sets when rep targets change. Weighted lifts
// only — timed holds and bodyweight moves keep their existing metric.

const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(dateStr) {
  return new Date(dateStr + "T00:00:00").getTime();
}

export function isWeighted(ex) {
  return !isTimeBased(ex) && !isBodyweightEx(ex);
}

// e1RM for one set, rounded to 0.1 lb; null when weight or reps is missing.
export function epley1RM(weight, reps) {
  const w = parseFloat(weight);
  const r = parseFloat(reps);
  if (!w || !r || w <= 0 || r <= 0) return null;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

// Per-set e1RM aligned index-for-index with `history`, so it can be plotted
// as a second series on the same chart. Sets that can't be computed (missing
// weight or reps) carry the nearest known value so the line stays continuous.
// Returns null for non-weighted lifts or when no set is computable.
export function e1rmSeries(ex, history) {
  if (!isWeighted(ex)) return null;
  const raw = history.map((e) => epley1RM(e.weight, e.reps));
  const first = raw.find((v) => v != null);
  if (first == null) return null;
  let last = first;
  return raw.map((v) => (v == null ? last : (last = v)));
}

// Headline stat: best e1RM of the most recent session, and the change against
// the session closest to 30 days before it (same anchor logic as the
// bodyweight trend). delta30 is null until there's a second session to
// compare against.
export function e1rmStats(ex, history) {
  if (!isWeighted(ex)) return null;
  const byDate = new Map();
  for (const e of history) {
    const v = epley1RM(e.weight, e.reps);
    if (v == null) continue;
    if (!byDate.has(e.date) || v > byDate.get(e.date)) byDate.set(e.date, v);
  }
  const points = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!points.length) return null;
  const [lastDate, current] = points[points.length - 1];
  if (points.length === 1) return { current, delta30: null };
  const target = toTime(lastDate) - 30 * DAY_MS;
  const anchor = points
    .slice(0, -1)
    .reduce((best, p) => (Math.abs(toTime(p[0]) - target) < Math.abs(toTime(best[0]) - target) ? p : best));
  return { current, delta30: Math.round((current - anchor[1]) * 10) / 10 };
}

// History grouped into sessions (one per date, oldest first) for the
// exercise detail view's set list.
export function sessionsByDate(history) {
  const byDate = {};
  for (const e of history) (byDate[e.date] ??= []).push(e);
  return Object.entries(byDate)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, sets]) => ({ date, sets }));
}

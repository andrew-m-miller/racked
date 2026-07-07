// Mesocycle programming (Phase 15): pure helpers around `meta.cycle` —
// {lengthWeeks, deloadWeeks: [n], startDate}. Week-in-block always derives
// from startDate and the Monday week key (no stored counter to drift), and
// every reader goes through normalizeCycle so a missing/garbled cycle means
// "no block structure" rather than an error — the same read-site-fallback
// rule the rest of the plan jsonb follows.

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(dateStr) {
  return new Date(dateStr + "T00:00:00");
}

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Monday of the week containing dateStr — same week rule as recap.weekStart
// and ProgressView's streaks (kept local to avoid a recap <-> cycleUtils
// import cycle; the two must stay in step).
export function cycleWeekKey(dateStr) {
  const d = toDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toKey(d);
}

export const MIN_BLOCK_WEEKS = 2;
export const MAX_BLOCK_WEEKS = 12;

// Validate a raw meta.cycle into a usable shape, or null. Null means every
// caller behaves exactly as before Phase 15 — this is the fallback gate, so
// it's deliberately strict: a cycle we can't fully trust is no cycle.
export function normalizeCycle(cycle) {
  if (!cycle || typeof cycle !== "object") return null;
  const lengthWeeks = Number(cycle.lengthWeeks);
  if (!Number.isInteger(lengthWeeks) || lengthWeeks < MIN_BLOCK_WEEKS || lengthWeeks > MAX_BLOCK_WEEKS) return null;
  if (typeof cycle.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(cycle.startDate)) return null;
  if (isNaN(toDate(cycle.startDate).getTime())) return null;
  const raw = Array.isArray(cycle.deloadWeeks) ? cycle.deloadWeeks.map(Number) : [];
  const deloadWeeks = [...new Set(raw.filter((w) => Number.isInteger(w) && w >= 1 && w <= lengthWeeks))].sort((a, b) => a - b);
  if (!deloadWeeks.length) return null; // a block with no deload is just today's linear model
  return { lengthWeeks, deloadWeeks, startDate: cycle.startDate };
}

// 1-based week within the repeating block for the week containing dateStr.
// Blocks repeat indefinitely from startDate; dates before the block started
// (or an invalid cycle) return null — "no cycle position".
export function weekInBlock(cycle, dateStr) {
  const c = normalizeCycle(cycle);
  if (!c || !dateStr) return null;
  const diff = toDate(cycleWeekKey(dateStr)).getTime() - toDate(cycleWeekKey(c.startDate)).getTime();
  if (diff < 0) return null;
  const weeks = Math.round(diff / (7 * DAY_MS));
  return (weeks % c.lengthWeeks) + 1;
}

// Does dateStr fall in a planned deload week? False whenever the cycle is
// missing/invalid or the date predates it — safe to call unconditionally.
export function isDeloadDate(cycle, dateStr) {
  const week = weekInBlock(cycle, dateStr);
  if (week == null) return false;
  return normalizeCycle(cycle).deloadWeeks.includes(week);
}

// The one-line block status the header/insight strip shows, or null when the
// cycle isn't active for this date. weeksToDeload is 0 during the deload week
// itself, 1 when it's next week, etc. (scanning into the next block repeat).
export function cycleStatus(cycle, dateStr) {
  const c = normalizeCycle(cycle);
  const week = weekInBlock(c, dateStr);
  if (week == null) return null;
  let weeksToDeload = 0;
  while (!c.deloadWeeks.includes(((week - 1 + weeksToDeload) % c.lengthWeeks) + 1)) weeksToDeload++;
  return { week, lengthWeeks: c.lengthWeeks, deload: weeksToDeload === 0, weeksToDeload };
}

// "Week 3 of 4 — deload next week" / "Week 4 of 4 — deload week".
export function cycleStatusLabel(status) {
  if (!status) return null;
  const base = `Week ${status.week} of ${status.lengthWeeks}`;
  if (status.deload) return `${base} — deload week`;
  if (status.weeksToDeload === 1) return `${base} — deload next week`;
  return base;
}

// Apply a coach cycle_change to plan meta, returning the next meta or null
// when the result wouldn't be a usable cycle (the caller surfaces that, same
// contract as planUtils.applyPlanChange). Two shapes:
//   {lengthWeeks?, deloadWeeks?, startDate?} — nulls leave the existing
//     value unchanged; when no cycle exists yet, missing pieces default to a
//     block starting this week with the deload on its last week.
//   {cycle: <full cycle> | null} — full restore/remove, produced by
//     coachUtils.inverseCycleChange so undo can put back exactly what was
//     there (including "nothing").
export function applyCycleChange(meta, change, today) {
  const base = meta || {};
  if (change && "cycle" in change) {
    const next = { ...base };
    if (change.cycle == null) delete next.cycle;
    else {
      const c = normalizeCycle(change.cycle);
      if (!c) return null;
      next.cycle = c;
    }
    return next;
  }
  const existing = normalizeCycle(base.cycle);
  const lengthWeeks = change?.lengthWeeks ?? existing?.lengthWeeks ?? 4;
  const candidate = normalizeCycle({
    lengthWeeks,
    deloadWeeks: change?.deloadWeeks ?? existing?.deloadWeeks ?? [Number(lengthWeeks)],
    startDate: change?.startDate ?? existing?.startDate ?? (today ? cycleWeekKey(today) : null),
  });
  if (!candidate) return null;
  return { ...base, cycle: candidate };
}

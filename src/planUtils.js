import plan from "../exercises.json";

// The bundled plan is the seed/fallback; the live plan is loaded from
// Supabase (see storage.loadPlan) and passed around as `days` + `meta`.
export const SEED_DAYS = plan.days;
export const SEED_META = plan.meta;
export const CAT_COLOR = { Upper: "#5EC8D8", Lower: "#E8967A", Core: "#B9A6E0" };

// Plans run 2–5 days; ids are letters A–E assigned by index (slug-safe, so
// finisher-a/-b/... history keeps resolving). First three plates match the seed.
export const PLATE_COLORS = ["#3B82F6", "#FACC15", "#22C55E", "#E8967A", "#B9A6E0"];
export const MAX_DAYS = 5;

export function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Today's date as a local YYYY-MM-DD key. Uses the device's local calendar
// rather than UTC (toISOString) so an evening workout in a timezone behind UTC
// lands on the right day — every stored log date is parsed as local midnight,
// so `today` must be local too or sessions drift a day forward.
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Holds (Plank, Side Plank) log seconds in the `weight` field and reps in
// the `reps` field; other bodyweight moves (e.g. Hanging Knee Raise) just log reps.
export function isTimeBased(ex) {
  return /sec/i.test(ex.reps);
}

export function isBodyweightEx(ex) {
  return ex.start === "Bodyweight";
}

// The metric that progress/PRs are measured on: seconds for timed holds,
// reps for rep-only bodyweight moves, pounds for everything else.
export function exMetric(ex, entry) {
  const repBased = isBodyweightEx(ex) && !isTimeBased(ex);
  return repBased ? parseFloat(entry.reps) || 0 : parseFloat(entry.weight) || 0;
}

export function metricUnit(ex) {
  if (isTimeBased(ex)) return "sec";
  return isBodyweightEx(ex) ? "reps" : "lb";
}

// Finisher cardio logs live under a per-day slug ("finisher-a" etc.) in the
// same logs table: reps = minutes, weight unused, note = machine/mode.
export function finisherSlug(dayId) {
  return `finisher-${String(dayId).toLowerCase()}`;
}

// Which plan day was trained on a given date. Exercises shared across days
// (e.g. Seated Cable Row on A and C) make a single-slug lookup ambiguous, so
// the day is chosen by majority vote over that date's entries. Substitutes
// count too, via each exercise's alts, as does the day's finisher.
export function dayForDate(days, logs, date) {
  const votes = {};
  for (const d of days) {
    for (const ex of d.exercises) {
      const names = [ex.name, ...(ex.alts || []).map((a) => a.name)];
      for (const name of names) {
        for (const e of logs[slug(name)] || []) {
          if (e.date === date) votes[d.id] = (votes[d.id] || 0) + 1;
        }
      }
    }
    for (const e of logs[finisherSlug(d.id)] || []) {
      if (e.date === date) votes[d.id] = (votes[d.id] || 0) + 1;
    }
  }
  const winner = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
  return winner || null;
}

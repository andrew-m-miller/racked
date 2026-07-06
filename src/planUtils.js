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

// Which plan day was trained on each logged date, computed in one pass over
// the logs. Exercises shared across days (e.g. Seated Cable Row on A and C)
// make a single-slug lookup ambiguous, so each date's day is chosen by
// majority vote over its entries (ties go to the earlier day in plan order,
// matching the old per-date vote). Substitutes count too, via each exercise's
// alts, as does the day's finisher. Callers that ask about many dates (the
// consistency calendar, the recap) should build this once instead of calling
// dayForDate per date — the old per-date scan grew as dates × total entries.
export function buildDayIndex(days, logs) {
  const slugDays = new Map(); // history slug -> every day id it votes for
  for (const d of days) {
    const names = d.exercises.flatMap((ex) => [ex.name, ...(ex.alts || []).map((a) => a.name)]);
    for (const key of [...names.map(slug), finisherSlug(d.id)]) {
      if (!slugDays.has(key)) slugDays.set(key, new Set());
      slugDays.get(key).add(d.id);
    }
  }

  const votes = new Map(); // date -> Map(dayId -> count)
  for (const [key, entries] of Object.entries(logs)) {
    const ids = slugDays.get(key);
    if (!ids) continue;
    for (const e of entries) {
      let v = votes.get(e.date);
      if (!v) votes.set(e.date, (v = new Map()));
      for (const id of ids) v.set(id, (v.get(id) || 0) + 1);
    }
  }

  const index = new Map();
  for (const [date, v] of votes) {
    let winner = null;
    let best = 0;
    for (const d of days) {
      const n = v.get(d.id) || 0;
      if (n > best) {
        winner = d.id;
        best = n;
      }
    }
    index.set(date, winner);
  }
  return index;
}

export function dayForDate(days, logs, date) {
  return buildDayIndex(days, logs).get(date) ?? null;
}

// Apply a coach-suggested tweak ({exercise, sets, reps}, nulls = leave
// unchanged) to the plan. Matches by slug across all days, primaries only —
// the same matching rule as coachUtils.inversePlanChange, which computes the
// revert. Returns the updated days, or null when the exercise isn't in the
// plan (the caller surfaces that instead of showing "Applied" for a no-op).
export function applyPlanChange(days, change) {
  const key = slug(change.exercise);
  let matched = false;
  const next = days.map((d) => ({
    ...d,
    exercises: d.exercises.map((ex) => {
      if (slug(ex.name) !== key) return ex;
      matched = true;
      return {
        ...ex,
        ...(change.sets != null ? { sets: Number(change.sets) } : {}),
        ...(change.reps != null ? { reps: String(change.reps) } : {}),
      };
    }),
  }));
  return matched ? next : null;
}

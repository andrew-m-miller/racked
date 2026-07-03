import plan from "../exercises.json";

export const DAYS = plan.days;
export const CAT_COLOR = { Upper: "#5EC8D8", Lower: "#E8967A", Core: "#B9A6E0" };

export function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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

// Which plan day was trained on a given date. Exercises shared across days
// (e.g. Seated Cable Row on A and C) make a single-slug lookup ambiguous, so
// the day is chosen by majority vote over that date's entries.
export function dayForDate(logs, date) {
  const votes = {};
  for (const d of DAYS) {
    for (const ex of d.exercises) {
      for (const e of logs[slug(ex.name)] || []) {
        if (e.date === date) votes[d.id] = (votes[d.id] || 0) + 1;
      }
    }
  }
  const winner = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
  return winner || null;
}

import { slug } from "./planUtils.js";
import { weekStart, shiftDays } from "./recap.js";

// Pure helpers for the coach-run cache (Phase 9): computing undo changes,
// deciding when the weekly auto-run should fire, and labeling runs. Kept
// free of React/Supabase so they're testable like the rest of the logic core.

// The plan_change that would revert `change`, captured from the plan as it
// stands *before* the change is applied. Only the fields the change touches
// are restored (nulls = leave unchanged), matching handleApplyPlanChange's
// contract. Returns null when the exercise isn't in the plan (primaries only,
// same matching rule as the apply path).
export function inversePlanChange(days, change) {
  const key = slug(change.exercise);
  for (const d of days) {
    for (const ex of d.exercises) {
      if (slug(ex.name) === key) {
        return {
          exercise: ex.name,
          sets: change.sets != null ? ex.sets : null,
          reps: change.reps != null ? String(ex.reps) : null,
        };
      }
    }
  }
  return null;
}

// The cycle_change that would revert one, captured from meta as it stands
// *before* the change is applied (Phase 15). Unlike plan changes, a cycle
// change can create the block structure from nothing, so the inverse is a
// full restore: {cycle: <previous cycle>} — or {cycle: null}, which
// applyCycleChange reads as "remove it again".
export function inverseCycleChange(meta) {
  return { cycle: meta?.cycle ?? null };
}

// Should the weekly auto-run fire? Reviews the *completed* week (Mon–Sun
// before today's week), like the roadmap's Sunday-night cron would — running
// on the current week Monday morning would review an empty week. Returns
// {weekStart, recapDay} when a run is due (recapDay = the Sunday to build the
// recap "as of"), or null when that week already has a run or saw no training.
export function pendingAutoReview({ today, runs, logs }) {
  const prevEnd = shiftDays(weekStart(today), -1);
  const prevStart = weekStart(prevEnd);
  if (runs.some((r) => r.week_start === prevStart)) return null;
  const trained = Object.values(logs).some((entries) =>
    entries.some((e) => e.date >= prevStart && e.date <= prevEnd)
  );
  return trained ? { weekStart: prevStart, recapDay: prevEnd } : null;
}

// "Week of Jun 23 – Jun 29" for a run's week_start key.
export function weekLabel(weekStartKey) {
  const fmt = (dateStr) =>
    new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Week of ${fmt(weekStartKey)} – ${fmt(shiftDays(weekStartKey, 6))}`;
}

// Insert-or-replace a run in a week_start-descending list (the shape
// AppState keeps and CoachSection renders).
export function upsertRun(runs, run) {
  return [...runs.filter((r) => r.week_start !== run.week_start), run].sort((a, b) =>
    a.week_start < b.week_start ? 1 : -1
  );
}

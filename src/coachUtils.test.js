import { describe, it, expect } from "vitest";
import { inversePlanChange, inverseCycleChange, pendingAutoReview, weekLabel, upsertRun } from "./coachUtils.js";
import { applyCycleChange } from "./cycleUtils.js";
import { weekStart, shiftDays } from "./recap.js";

// Fixed "today": Saturday 2026-07-04 → current week starts Mon 2026-06-29,
// the completed week the auto-run reviews is Mon 2026-06-22 – Sun 2026-06-28.
const TODAY = "2026-07-04";

const DAYS = [
  {
    id: "A",
    name: "Upper Day",
    exercises: [
      {
        name: "Bench Press",
        cat: "Upper",
        sets: 3,
        reps: "8-10",
        start: "95 lb barbell",
        alts: [{ name: "DB Bench Press", start: "35 lb dumbbells" }],
      },
      { name: "Plank", cat: "Core", sets: 3, reps: "30-45 sec", start: "Bodyweight" },
    ],
  },
];

describe("weekStart / shiftDays", () => {
  it("finds Monday of the containing week", () => {
    expect(weekStart(TODAY)).toBe("2026-06-29");
    expect(weekStart("2026-06-29")).toBe("2026-06-29"); // Monday maps to itself
    expect(weekStart("2026-07-05")).toBe("2026-06-29"); // Sunday still belongs to Monday's week
  });

  it("shifts across month boundaries", () => {
    expect(shiftDays("2026-07-01", -2)).toBe("2026-06-29");
    expect(shiftDays("2026-06-29", 6)).toBe("2026-07-05");
  });
});

describe("inversePlanChange", () => {
  it("captures only the fields the change touches", () => {
    const inv = inversePlanChange(DAYS, { exercise: "Bench Press", sets: 4, reps: null });
    expect(inv).toEqual({ exercise: "Bench Press", sets: 3, reps: null });
  });

  it("captures both fields when both change", () => {
    const inv = inversePlanChange(DAYS, { exercise: "Bench Press", sets: 4, reps: "6-8" });
    expect(inv).toEqual({ exercise: "Bench Press", sets: 3, reps: "8-10" });
  });

  it("round-trips: applying the inverse restores the original", () => {
    const change = { exercise: "Bench Press", sets: 4, reps: "6-8" };
    const inv = inversePlanChange(DAYS, change);
    // Mirror handleApplyPlanChange's merge rule.
    const applyTo = (ex, c) => ({
      ...ex,
      ...(c.sets != null ? { sets: Number(c.sets) } : {}),
      ...(c.reps != null ? { reps: String(c.reps) } : {}),
    });
    const changed = applyTo(DAYS[0].exercises[0], change);
    expect(applyTo(changed, inv)).toEqual(DAYS[0].exercises[0]);
  });

  it("returns null for an exercise not in the plan", () => {
    expect(inversePlanChange(DAYS, { exercise: "Squat", sets: 4, reps: null })).toBeNull();
  });

  it("matches primaries only, not alts (same rule as the apply path)", () => {
    expect(inversePlanChange(DAYS, { exercise: "DB Bench Press", sets: 4, reps: null })).toBeNull();
  });
});

describe("inverseCycleChange", () => {
  const CYCLE = { lengthWeeks: 4, deloadWeeks: [4], startDate: "2026-06-01" };

  it("captures the whole previous cycle for a full restore", () => {
    expect(inverseCycleChange({ daysPerWeek: 3, cycle: CYCLE })).toEqual({ cycle: CYCLE });
  });

  it("captures the absence of a cycle so undoing a creation removes it", () => {
    expect(inverseCycleChange({ daysPerWeek: 3 })).toEqual({ cycle: null });
    expect(inverseCycleChange(undefined)).toEqual({ cycle: null });
  });

  it("round-trips through applyCycleChange: apply, undo, back to the original meta", () => {
    const meta = { daysPerWeek: 3 };
    const inverse = inverseCycleChange(meta);
    const applied = applyCycleChange(meta, { lengthWeeks: 4, deloadWeeks: [4], startDate: "2026-06-01" }, "2026-07-04");
    expect(applied.cycle).toEqual(CYCLE);
    expect(applyCycleChange(applied, inverse)).toEqual(meta);
  });
});

describe("pendingAutoReview", () => {
  const trainedLastWeek = { "bench-press": [{ date: "2026-06-24", weight: "95", reps: "10" }] };

  it("is due when last week was trained and has no run yet", () => {
    expect(pendingAutoReview({ today: TODAY, runs: [], logs: trainedLastWeek })).toEqual({
      weekStart: "2026-06-22",
      recapDay: "2026-06-28",
    });
  });

  it("is not due when last week already has a run", () => {
    const runs = [{ week_start: "2026-06-22", review: { narrative: "", suggestions: [] }, applied: {} }];
    expect(pendingAutoReview({ today: TODAY, runs, logs: trainedLastWeek })).toBeNull();
  });

  it("is not due when last week saw no training", () => {
    const logs = { "bench-press": [{ date: "2026-06-20", weight: "95", reps: "10" }] }; // two weeks back
    expect(pendingAutoReview({ today: TODAY, runs: [], logs })).toBeNull();
  });

  it("a current-week run does not satisfy last week's check-in", () => {
    const runs = [{ week_start: "2026-06-29", review: { narrative: "", suggestions: [] }, applied: {} }];
    expect(pendingAutoReview({ today: TODAY, runs, logs: trainedLastWeek })).not.toBeNull();
  });
});

describe("weekLabel", () => {
  it("labels Monday through Sunday", () => {
    expect(weekLabel("2026-06-22")).toBe("Week of Jun 22 – Jun 28");
  });
});

describe("upsertRun", () => {
  const run = (week) => ({ week_start: week, review: { narrative: week, suggestions: [] }, applied: {} });

  it("inserts keeping newest week first", () => {
    const runs = upsertRun([run("2026-06-22")], run("2026-06-29"));
    expect(runs.map((r) => r.week_start)).toEqual(["2026-06-29", "2026-06-22"]);
  });

  it("replaces an existing week's run", () => {
    const updated = { ...run("2026-06-22"), applied: { 0: { inverse: null } } };
    const runs = upsertRun([run("2026-06-29"), run("2026-06-22")], updated);
    expect(runs).toHaveLength(2);
    expect(runs[1].applied).toEqual({ 0: { inverse: null } });
  });
});

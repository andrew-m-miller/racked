import { describe, it, expect } from "vitest";
import {
  slug,
  localDateKey,
  isTimeBased,
  isBodyweightEx,
  exMetric,
  finisherSlug,
  dayForDate,
  buildDayIndex,
  applyPlanChange,
} from "./planUtils.js";
import { inversePlanChange } from "./coachUtils.js";

// ---- fixtures ----

function makeDays() {
  return [
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
          alts: [{ name: "DB Bench Press", start: "35 lb DB" }],
        },
        { name: "Seated Cable Row", cat: "Upper", sets: 3, reps: "10-12", start: "90 lb" },
      ],
    },
    {
      id: "B",
      name: "Lower Day",
      exercises: [{ name: "Goblet Squat", cat: "Lower", sets: 3, reps: "10-12", start: "30 lb DB" }],
    },
    {
      id: "C",
      name: "Full Body Day",
      // Shares Seated Cable Row with day A, so a date logging both that and a
      // C-only exercise should still tip the majority vote to C.
      exercises: [
        { name: "Seated Cable Row", cat: "Upper", sets: 3, reps: "10-12", start: "90 lb" },
        { name: "Lat Pulldown", cat: "Upper", sets: 3, reps: "10-12", start: "80 lb" },
      ],
    },
  ];
}

describe("localDateKey", () => {
  it("uses local calendar day, not UTC, for a late-evening timestamp", () => {
    // 11pm on July 4 in America/New_York is already July 5 in UTC — this is
    // the exact drift the toISOString() bug produced.
    expect(localDateKey(new Date(2026, 6, 4, 23, 0))).toBe("2026-07-04");
  });

  it("zero-pads single-digit months and days", () => {
    expect(localDateKey(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});

describe("slug", () => {
  it("lowercases and hyphenates", () => {
    expect(slug("Goblet Squat")).toBe("goblet-squat");
  });

  it("collapses runs of non-alphanumerics and trims leading/trailing hyphens", () => {
    expect(slug("DB Bench (Flat)")).toBe("db-bench-flat");
  });
});

describe("dayForDate", () => {
  it("resolves to the day whose exercises match the most logged entries", () => {
    const days = makeDays();
    const logs = {
      "bench-press": [{ date: "2026-07-01", weight: "95", reps: "10" }],
      "seated-cable-row": [{ date: "2026-07-01", weight: "90", reps: "10" }],
    };
    // Both entries belong to day A (bench-press is A-only; seated-cable-row is
    // shared with C), so A wins 2-1 over C's single shared match.
    expect(dayForDate(days, logs, "2026-07-01")).toBe("A");
  });

  it("counts a logged substitute (alt) toward its slot's day", () => {
    const days = makeDays();
    const logs = {
      "db-bench-press": [{ date: "2026-07-01", weight: "35", reps: "10" }],
      "lat-pulldown": [{ date: "2026-07-01", weight: "80", reps: "10" }],
    };
    // db-bench-press is an alt for day A's Bench Press slot, so A should win
    // even though the literal name doesn't appear in A's exercise list.
    expect(dayForDate(days, logs, "2026-07-01")).toBe("A");
  });

  it("counts the day's finisher entry toward its own vote", () => {
    const days = makeDays();
    const logs = {
      "seated-cable-row": [{ date: "2026-07-01", weight: "90", reps: "10" }],
      "finisher-c": [{ date: "2026-07-01", reps: "20" }],
    };
    // seated-cable-row alone is a 1-1 tie between A and C; C's finisher entry
    // breaks the tie in C's favor.
    expect(dayForDate(days, logs, "2026-07-01")).toBe("C");
  });

  it("returns null when there are no entries on that date", () => {
    const days = makeDays();
    const logs = {
      "bench-press": [{ date: "2026-07-01", weight: "95", reps: "10" }],
    };
    expect(dayForDate(days, logs, "2026-07-02")).toBeNull();
  });
});

describe("buildDayIndex", () => {
  it("maps every logged date in one pass, matching dayForDate", () => {
    const days = makeDays();
    const logs = {
      "bench-press": [{ date: "2026-07-01", weight: "95", reps: "10" }],
      "goblet-squat": [{ date: "2026-07-03", weight: "35", reps: "12" }],
      "lat-pulldown": [{ date: "2026-07-05", weight: "80", reps: "10" }],
    };
    const index = buildDayIndex(days, logs);
    expect(index.get("2026-07-01")).toBe("A");
    expect(index.get("2026-07-03")).toBe("B");
    expect(index.get("2026-07-05")).toBe("C");
    expect(index.get("2026-07-02")).toBeUndefined();
  });

  it("breaks a tied vote toward the earlier day in plan order", () => {
    const days = makeDays();
    // seated-cable-row is on A and C: one entry gives each a single vote,
    // and the tie goes to A (first in plan order), same as the old scan.
    const logs = { "seated-cable-row": [{ date: "2026-07-01", weight: "90", reps: "10" }] };
    expect(buildDayIndex(days, logs).get("2026-07-01")).toBe("A");
  });

  it("ignores orphaned slugs that aren't in the plan", () => {
    const days = makeDays();
    const logs = { "removed-exercise": [{ date: "2026-07-01", weight: "50", reps: "10" }] };
    expect(buildDayIndex(days, logs).size).toBe(0);
  });
});

describe("applyPlanChange", () => {
  it("updates only the touched fields of the matched exercise", () => {
    const days = makeDays();
    const next = applyPlanChange(days, { exercise: "Goblet Squat", sets: 4, reps: null });
    const squat = next[1].exercises[0];
    expect(squat.sets).toBe(4);
    expect(squat.reps).toBe("10-12"); // null = leave unchanged
    expect(days[1].exercises[0].sets).toBe(3); // input untouched
  });

  it("matches by slug, so casing/punctuation differences still apply", () => {
    const days = makeDays();
    const next = applyPlanChange(days, { exercise: "goblet squat", sets: null, reps: "8-10" });
    expect(next[1].exercises[0].reps).toBe("8-10");
  });

  it("returns null when the exercise isn't in the plan", () => {
    expect(applyPlanChange(makeDays(), { exercise: "Machine Fly", sets: 3, reps: "12" })).toBeNull();
  });

  it("round-trips with inversePlanChange: apply then apply the inverse restores the plan", () => {
    const days = makeDays();
    const change = { exercise: "Bench Press", sets: 4, reps: "6-8" };
    const inverse = inversePlanChange(days, change); // captured before applying
    const changed = applyPlanChange(days, change);
    expect(changed[0].exercises[0].sets).toBe(4);
    const restored = applyPlanChange(changed, inverse);
    expect(restored[0].exercises[0].sets).toBe(3);
    expect(restored[0].exercises[0].reps).toBe("8-10");
  });
});

describe("isTimeBased", () => {
  it("is true for reps strings with 'sec'", () => {
    expect(isTimeBased({ reps: "30-45 sec" })).toBe(true);
  });

  it("is false for plain numeric reps", () => {
    expect(isTimeBased({ reps: "12" })).toBe(false);
  });
});

describe("isBodyweightEx", () => {
  it("is true when start is 'Bodyweight'", () => {
    expect(isBodyweightEx({ start: "Bodyweight" })).toBe(true);
  });

  it("is false otherwise", () => {
    expect(isBodyweightEx({ start: "95 lb barbell" })).toBe(false);
  });
});

describe("exMetric", () => {
  it("reads seconds from weight for timed holds", () => {
    const ex = { reps: "30-45 sec", start: "Bodyweight" };
    expect(exMetric(ex, { weight: "40", reps: "1" })).toBe(40);
  });

  it("reads reps for rep-based bodyweight moves", () => {
    const ex = { reps: "12-15", start: "Bodyweight" };
    expect(exMetric(ex, { weight: "", reps: "14" })).toBe(14);
  });

  it("reads pounds for everything else", () => {
    const ex = { reps: "8-10", start: "95 lb barbell" };
    expect(exMetric(ex, { weight: "95", reps: "10" })).toBe(95);
  });
});

describe("finisherSlug", () => {
  it("lowercases the day id into a finisher-<id> slug", () => {
    expect(finisherSlug("A")).toBe("finisher-a");
  });
});

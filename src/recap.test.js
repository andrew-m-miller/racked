import { describe, it, expect } from "vitest";
import { buildWeeklyRecap, buildWeeklyInsights } from "./recap.js";

// Fixed "today" used across tests: Saturday 2026-07-04, so the recap week
// runs Mon 2026-06-29 through Sat 2026-07-04 (weeks start Monday), and the
// previous week is Mon 2026-06-22 through Sun 2026-06-28.
const TODAY = "2026-07-04";

function volumeDays() {
  return [
    {
      id: "A",
      name: "Upper Day",
      exercises: [
        { name: "Bench Press", cat: "Upper", sets: 3, reps: "8-10", start: "95 lb barbell" },
        { name: "Plank", cat: "Core", sets: 3, reps: "30-45 sec", start: "Bodyweight" },
      ],
    },
  ];
}

describe("buildWeeklyRecap volume line", () => {
  it("ignores a log slug that matches no plan exercise (renamed/dropped move)", () => {
    const days = volumeDays();
    const logs = {
      "bench-press": [{ date: "2026-06-30", weight: "95", reps: "10", effort: 0 }],
      // Slug has no matching exercise in `days` (e.g. the move was renamed or
      // dropped from the plan) — if counted, its 50*12=600 would visibly bump
      // the total from 950 to 1550.
      "old-cable-fly": [{ date: "2026-06-30", weight: "50", reps: "12" }],
    };
    const recap = buildWeeklyRecap({ days, logs, weighIns: [], today: TODAY });
    expect(recap).toMatch("Lifting volume: 950 lb");
  });

  it("excludes timed holds and bodyweight moves from volume", () => {
    const days = [
      {
        id: "A",
        name: "Upper Day",
        exercises: [
          { name: "Bench Press", cat: "Upper", sets: 3, reps: "8-10", start: "95 lb barbell" },
          { name: "Plank", cat: "Core", sets: 3, reps: "30-45 sec", start: "Bodyweight" },
          { name: "Hanging Knee Raise", cat: "Core", sets: 3, reps: "12-15", start: "Bodyweight" },
        ],
      },
    ];
    const logs = {
      "bench-press": [{ date: "2026-06-30", weight: "95", reps: "10", effort: 0 }],
      plank: [{ date: "2026-06-30", weight: "40", reps: "1" }],
      "hanging-knee-raise": [{ date: "2026-06-30", weight: "", reps: "15" }],
    };
    const recap = buildWeeklyRecap({ days, logs, weighIns: [], today: TODAY });
    expect(recap).toMatch("Lifting volume: 950 lb");
  });

  it("excludes finisher entries from volume", () => {
    const days = volumeDays();
    const logs = {
      "bench-press": [{ date: "2026-06-30", weight: "95", reps: "10", effort: 0 }],
      "finisher-a": [{ date: "2026-06-30", reps: "20", note: "Bike" }],
    };
    const recap = buildWeeklyRecap({ days, logs, weighIns: [], today: TODAY });
    expect(recap).toMatch("Lifting volume: 950 lb");
  });

  it("sums weight x reps across in-week entries and reports last week's total", () => {
    const days = volumeDays();
    const logs = {
      "bench-press": [
        // previous week: 90*8 + 90*8 = 1440
        { date: "2026-06-23", weight: "90", reps: "8", effort: 0 },
        { date: "2026-06-25", weight: "90", reps: "8", effort: 0 },
        // current week: 95*10 + 95*10 = 1900
        { date: "2026-06-30", weight: "95", reps: "10", effort: 0 },
        { date: "2026-07-02", weight: "95", reps: "10", effort: -1 },
      ],
    };
    const recap = buildWeeklyRecap({ days, logs, weighIns: [], today: TODAY });
    expect(recap).toMatch("Lifting volume: 1,900 lb (last week 1,440 lb)");
  });
});

describe("buildWeeklyRecap full snapshot", () => {
  const days = [
    {
      id: "A",
      name: "Upper Day",
      exercises: [
        { name: "Bench Press", cat: "Upper", sets: 3, reps: "8-10", start: "95 lb barbell" },
        { name: "Plank", cat: "Core", sets: 3, reps: "30-45 sec", start: "Bodyweight" },
        { name: "Hanging Knee Raise", cat: "Core", sets: 3, reps: "12-15", start: "Bodyweight" },
      ],
    },
    {
      id: "B",
      name: "Lower Day",
      exercises: [{ name: "Goblet Squat", cat: "Lower", sets: 3, reps: "10-12", start: "30 lb DB" }],
    },
  ];

  const logs = {
    "bench-press": [
      { date: "2026-06-23", weight: "90", reps: "8", effort: 0 },
      { date: "2026-06-25", weight: "90", reps: "8", effort: 0 },
      { date: "2026-06-30", weight: "95", reps: "10", effort: 0 },
      { date: "2026-07-02", weight: "95", reps: "10", effort: -1 },
    ],
    plank: [
      { date: "2026-07-01", weight: "40", reps: "1" },
      { date: "2026-07-01", weight: "35", reps: "1" },
      { date: "2026-07-01", weight: "30", reps: "1" },
    ],
    "hanging-knee-raise": [
      { date: "2026-07-01", weight: "", reps: "15" },
      { date: "2026-07-01", weight: "", reps: "14" },
      { date: "2026-07-01", weight: "", reps: "13" },
    ],
    "finisher-a": [{ date: "2026-07-03", reps: "20", note: "Bike intervals" }],
    // Orphaned slug: no exercise in `days` maps to it (renamed/dropped move).
    // Excluded from the volume total, but it still prints a per-lift line with
    // a synthetic "?" def — the snapshot pins that behavior as-is.
    "old-cable-fly": [{ date: "2026-07-01", weight: "50", reps: "12" }],
  };

  const weighIns = [
    // Before the week start, so this is the baseline the delta is measured
    // against rather than the in-week weigh-in.
    { date: "2026-06-20", weight: "180" },
    { date: "2026-07-03", weight: "178.5" },
  ];

  const meta = { description: "test 2-day plan" };

  it("matches the full paste-block format", () => {
    const recap = buildWeeklyRecap({ days, logs, weighIns, today: TODAY, meta });
    expect(recap).toMatchInlineSnapshot(`
      "You're my strength coach. Below is my training week from my workout tracker.
      Tell me: what went well, what's stalling, and what to change next week.

      WEEK OF Mon, 6/29 – Sat, 7/4

      Program: test 2-day plan
      Progression rules the app follows: +5 lb upper / +10 lb lower at rep target, +5-10 sec on core holds, 10% deload after 2 straight misses; a hit rated "brutal" holds the weight and counts a half-miss, an "easy" hit doubles the lower-body jump.

      Sessions: 4 of 2 planned — Upper Day (Tue, 6/30), Upper Day (Wed, 7/1), Upper Day (Thu, 7/2), Upper Day (Fri, 7/3)
      Cardio finishers: 1 done, 20 min total (Bike intervals)
      Lifting volume: 1,900 lb (last week 1,440 lb)
      Bodyweight: 178.5 lb (Fri, 7/3) — -1.5 lb since Sat, 6/20

      Lifts this week:
      - Bench Press (Upper · target 3×8-10): 95 lb × 10; 95 lb × 10 — hit target — felt right/easy — app suggests: Try 100 lb
      - Plank (Core · target 3×30-45 sec): 40/35/30 sec — under target — app suggests: Hold 30-45 sec again — focus on form
      - Hanging Knee Raise (Core · target 3×12-15): 15/14/13 reps — under target — app suggests: Aim for 12-15 again
      - old-cable-fly (? · target 1×?): 50 lb × 12 — hit target"
    `);
  });

  it("includes a Sessions line", () => {
    // Sessions count distinct trained *dates*, not distinct plan days — Upper
    // Day was trained on 4 separate dates this week, so it reads 4 of 2.
    const recap = buildWeeklyRecap({ days, logs, weighIns, today: TODAY, meta });
    expect(recap).toMatch("Sessions: 4 of 2 planned");
  });

  it("includes a Bodyweight line with the delta since the baseline weigh-in", () => {
    const recap = buildWeeklyRecap({ days, logs, weighIns, today: TODAY, meta });
    expect(recap).toMatch("Bodyweight: 178.5 lb (Fri, 7/3) — -1.5 lb since Sat, 6/20");
  });
});

describe("buildWeeklyRecap edge cases", () => {
  it("reports no lifts logged when only a finisher was done this week", () => {
    const days = volumeDays();
    const logs = {
      "finisher-a": [{ date: "2026-06-30", reps: "20", note: "Bike" }],
    };
    const recap = buildWeeklyRecap({ days, logs, weighIns: [], today: TODAY });
    expect(recap).toMatch("No lifts logged yet this week.");
  });

  it("falls back to 'N-day plan' when meta is undefined", () => {
    const days = volumeDays();
    const recap = buildWeeklyRecap({ days, logs: {}, weighIns: [], today: TODAY, meta: undefined });
    expect(recap).toMatch("Program: 1-day plan");
  });
});

describe("buildWeeklyInsights", () => {
  function twoDays() {
    return [
      {
        id: "A",
        name: "Upper Day",
        exercises: [{ name: "Bench Press", cat: "Upper", sets: 3, reps: "8-10", start: "95 lb barbell" }],
      },
      {
        id: "B",
        name: "Lower Day",
        exercises: [{ name: "Goblet Squat", cat: "Lower", sets: 3, reps: "10-12", start: "30 lb DB" }],
      },
    ];
  }

  it("counts sessionsDone/sessionsPlanned and flags untrained days as missed", () => {
    const days = twoDays();
    const logs = {
      "bench-press": [{ date: "2026-06-30", weight: "95", reps: "10", effort: 0 }],
    };
    const insights = buildWeeklyInsights({ days, logs, today: TODAY });
    expect(insights.sessionsDone).toBe(1);
    expect(insights.sessionsPlanned).toBe(2);
    expect(insights.missedDays).toEqual(["Lower Day"]);
  });

  it("reports no missed days once every plan day has a trained date this week", () => {
    const days = twoDays();
    const logs = {
      "bench-press": [{ date: "2026-06-30", weight: "95", reps: "10", effort: 0 }],
      "goblet-squat": [{ date: "2026-07-01", weight: "30", reps: "12", effort: 0 }],
    };
    const insights = buildWeeklyInsights({ days, logs, today: TODAY });
    expect(insights.sessionsDone).toBe(2);
    expect(insights.missedDays).toEqual([]);
  });

  it("counts only weighted lifts in the current week's volume, carries prevVolume from last week, and excludes finishers/orphaned slugs", () => {
    const days = volumeDays(); // Bench Press (weighted) + Plank (timed/bodyweight)
    const logs = {
      "bench-press": [
        { date: "2026-06-23", weight: "90", reps: "8", effort: 0 }, // previous week: 720
        { date: "2026-06-30", weight: "95", reps: "10", effort: 0 }, // current week: 950
      ],
      plank: [{ date: "2026-06-30", weight: "40", reps: "1" }], // timed hold — excluded
      "finisher-a": [{ date: "2026-06-30", reps: "20", note: "Bike" }], // finisher — excluded
      "old-cable-fly": [{ date: "2026-06-30", weight: "50", reps: "12" }], // orphaned slug — excluded
    };
    const insights = buildWeeklyInsights({ days, logs, today: TODAY });
    expect(insights.volume).toBe(950);
    expect(insights.prevVolume).toBe(720);
  });

  it("flags a lift with 2 consecutive under-target sessions as a stall, and leaves a healthy lift out", () => {
    const days = [
      {
        id: "A",
        name: "Upper Day",
        exercises: [
          { name: "Bench Press", cat: "Upper", sets: 3, reps: "8-12", start: "30 lb DB" },
          { name: "Squat", cat: "Lower", sets: 3, reps: "8-12", start: "45 lb DB" },
        ],
      },
    ];
    const logs = {
      "bench-press": [
        { date: "2026-06-20", weight: "30", reps: "8", effort: null }, // miss
        { date: "2026-06-27", weight: "30", reps: "9", effort: null }, // miss — 2 in a row, trend "down"
      ],
      squat: [{ date: "2026-06-27", weight: "45", reps: "12", effort: null }], // hits target, trend "up"
    };
    const insights = buildWeeklyInsights({ days, logs, today: TODAY });
    const stallNames = insights.stalls.map((s) => s.name);
    expect(stallNames).toContain("Bench Press");
    expect(stallNames).not.toContain("Squat");
  });
});

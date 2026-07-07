import { describe, it, expect } from "vitest";
import { targetNumber, startNumber, computeSuggestion } from "./progression.js";

// ---- fixtures ----
const upperWeighted = { name: "Bench Press", cat: "Upper", sets: 3, reps: "8-12", start: "30 lb DB" };
const lowerWeighted = { name: "Squat", cat: "Lower", sets: 3, reps: "8-12", start: "45 lb DB" };
const timedCore = { name: "Plank", cat: "Core", sets: 3, reps: "30-45 sec", start: "Bodyweight" };
const bodyweightRep = { name: "Push-up", cat: "Upper", sets: 3, reps: "12", start: "Bodyweight" };

describe("targetNumber", () => {
  it("parses a plain rep count", () => {
    expect(targetNumber("12")).toBe(12);
  });

  it("parses a per-leg rep count", () => {
    expect(targetNumber("10/leg")).toBe(10);
  });

  it("parses a timed range, taking the top", () => {
    expect(targetNumber("30-45 sec")).toBe(45);
  });

  it("parses a rep range, taking the top", () => {
    expect(targetNumber("8-12")).toBe(12);
  });

  it("returns null when there are no digits", () => {
    expect(targetNumber("no digits here")).toBeNull();
  });
});

describe("startNumber", () => {
  it("parses a single starting weight", () => {
    expect(startNumber("30 lb DB")).toBe(30);
  });

  it("averages a weight range and rounds to the nearest 2.5", () => {
    expect(startNumber("30–35 lb DB")).toBe(32.5);
  });

  it("returns null for a non-numeric start", () => {
    expect(startNumber("Bodyweight")).toBeNull();
  });
});

describe("computeSuggestion — no history", () => {
  it("suggests the start weight for a weighted lift", () => {
    const s = computeSuggestion(upperWeighted, []);
    expect(s.text.startsWith("Start:")).toBe(true);
    expect(s.value).toBe("30");
    expect(s.trend).toBe("flat");
  });

  it("suggests holding to the target for a timed hold", () => {
    const s = computeSuggestion(timedCore, []);
    expect(s.text).toBe("Start: hold to 30-45 sec");
    expect(s.value).toBe("45");
    expect(s.trend).toBe("flat");
  });

  it("suggests hitting the rep target for a bodyweight move", () => {
    const s = computeSuggestion(bodyweightRep, []);
    expect(s.text).toBe("Start: hit 12 reps");
    expect(s.value).toBe("");
    expect(s.trend).toBe("flat");
  });
});

describe("computeSuggestion — weighted lifts", () => {
  it("bumps an Upper lift +5 lb when the top of the rep range is hit", () => {
    const history = [{ weight: 30, reps: 12, effort: null, date: "2026-01-01" }];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.text).toBe("Try 35 lb");
    expect(s.value).toBe("35");
    expect(s.trend).toBe("up");
  });

  it("bumps a Lower lift +10 lb when the target is hit", () => {
    const history = [{ weight: 45, reps: 12, effort: null, date: "2026-01-01" }];
    const s = computeSuggestion(lowerWeighted, history);
    expect(s.text).toBe("Try 55 lb");
    expect(s.value).toBe("55");
    expect(s.trend).toBe("up");
  });

  it("holds the weight and flags flat when the target is missed", () => {
    const history = [{ weight: 30, reps: 9, effort: null, date: "2026-01-01" }];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.text).toBe("Hold at 30 lb");
    expect(s.value).toBe("30");
    expect(s.trend).toBe("flat");
  });

  it("accepts string weight/reps/effort values", () => {
    const history = [{ weight: "30", reps: "12", effort: "0", date: "2026-01-01" }];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.text).toBe("Try 35 lb");
    expect(s.trend).toBe("up");
  });
});

describe("computeSuggestion — timed core holds", () => {
  it("adds 5 seconds (Core increment) and trends up on a hit", () => {
    const history = [{ weight: 45, reps: 1, effort: null, date: "2026-01-01" }];
    const s = computeSuggestion(timedCore, history);
    expect(s.text).toBe("Try +5-10 sec this time");
    expect(s.value).toBe("50");
    expect(s.trend).toBe("up");
  });

  it("holds the same time and trends flat on a miss", () => {
    const history = [{ weight: 30, reps: 1, effort: null, date: "2026-01-01" }];
    const s = computeSuggestion(timedCore, history);
    expect(s.text).toBe("Hold 30-45 sec again — focus on form");
    expect(s.value).toBe("30");
    expect(s.trend).toBe("flat");
  });
});

describe("computeSuggestion — rep-based bodyweight moves", () => {
  it("suggests adding a rep or two on a hit", () => {
    const history = [{ weight: 0, reps: 12, effort: null, date: "2026-01-01" }];
    const s = computeSuggestion(bodyweightRep, history);
    expect(s.text).toBe("Try to add a rep or two");
    expect(s.trend).toBe("up");
  });

  it("repeats the target on a miss", () => {
    const history = [{ weight: 0, reps: 8, effort: null, date: "2026-01-01" }];
    const s = computeSuggestion(bodyweightRep, history);
    expect(s.text).toBe("Aim for 12 again");
    expect(s.trend).toBe("flat");
  });
});

describe("computeSuggestion — deload", () => {
  it("deloads 10% (rounded to nearest 2.5 lb) after 2 consecutive misses", () => {
    const history = [
      { weight: 30, reps: 8, effort: null, date: "2026-01-01" },
      { weight: 30, reps: 9, effort: null, date: "2026-01-08" },
    ];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.text).toBe("Deload to 27.5 lb");
    expect(s.value).toBe("27.5");
    expect(s.trend).toBe("down");
    expect(s.detail).toBe("Missed target 2 sessions in a row");
  });

  it("does not deload from two missed sets within a single session", () => {
    // Normal fatigue pattern: hit, miss, miss across one workout. The session
    // is judged on its last set (one miss), not per set (two misses).
    const history = [
      { weight: 30, reps: 12, effort: null, date: "2026-01-01" },
      { weight: 30, reps: 10, effort: null, date: "2026-01-01" },
      { weight: 30, reps: 9, effort: null, date: "2026-01-01" },
    ];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.trend).toBe("flat");
    expect(s.text).toBe("Hold at 30 lb");
  });

  it("deloads after two sessions that each ended under target, regardless of earlier sets", () => {
    const history = [
      { weight: 30, reps: 12, effort: null, date: "2026-01-01" },
      { weight: 30, reps: 9, effort: null, date: "2026-01-01" },
      { weight: 30, reps: 12, effort: null, date: "2026-01-08" },
      { weight: 30, reps: 8, effort: null, date: "2026-01-08" },
    ];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.trend).toBe("down");
    expect(s.detail).toBe("Missed target 2 sessions in a row");
  });

  it("a travel week can't count against the original lift — the scan sees only that slug's sessions (Phase 13)", () => {
    // One miss, then a week of sessions logged under a substitute's slug
    // (i.e. nothing in THIS history), then back home. The calendar gap and
    // the substitute's sessions must contribute zero misses: still one
    // consecutive miss, so no deload.
    const history = [
      { weight: 30, reps: 12, effort: null, date: "2026-01-01" },
      { weight: 30, reps: 9, effort: null, date: "2026-01-08" }, // miss, then travel
    ];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.trend).toBe("flat");
    expect(s.text).toBe("Hold at 30 lb");
  });

  it("a session whose last set is a clean hit stops the scan even if its early sets missed", () => {
    const history = [
      { weight: 30, reps: 8, effort: null, date: "2026-01-01" },
      { weight: 30, reps: 9, effort: null, date: "2026-01-08" }, // early set under target
      { weight: 30, reps: 12, effort: null, date: "2026-01-08" }, // ...but the session ends on a hit
    ];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.trend).toBe("up");
    expect(s.text).toBe("Try 35 lb");
  });
});

describe("computeSuggestion — effort modifiers", () => {
  it("holds flat when the target is hit but rated brutal", () => {
    const history = [{ weight: 30, reps: 12, effort: 1, date: "2026-01-01" }];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.text).toBe("Hold at 30 lb — make it feel solid");
    expect(s.value).toBe("30");
    expect(s.trend).toBe("flat");
  });

  it("counts a brutal-rated hit as a half-miss, triggering deload with only one outright miss", () => {
    // scanning backwards: hit/brutal (+0.5), hit/brutal (+0.5), miss (+1) = 2.0
    const history = [
      { weight: 30, reps: 8, effort: null, date: "2026-01-01" },
      { weight: 30, reps: 12, effort: 1, date: "2026-01-08" },
      { weight: 30, reps: 12, effort: 1, date: "2026-01-15" },
    ];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.trend).toBe("down");
    expect(s.text.startsWith("Deload")).toBe(true);
  });

  it("stops the miss scan at the first clean hit, ignoring older misses", () => {
    const history = [
      { weight: 30, reps: 8, effort: null, date: "2026-01-01" },
      { weight: 30, reps: 8, effort: null, date: "2026-01-08" },
      { weight: 30, reps: 12, effort: null, date: "2026-01-15" }, // clean hit — breaks the scan
    ];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.trend).toBe("up");
    expect(s.text).toBe("Try 35 lb");
  });

  it("doubles the jump to +20 lb for an easy-rated hit on a Lower lift", () => {
    const history = [{ weight: 45, reps: 12, effort: -1, date: "2026-01-01" }];
    const s = computeSuggestion(lowerWeighted, history);
    expect(s.text).toBe("Try 65 lb");
    expect(s.value).toBe("65");
    expect(s.trend).toBe("up");
    expect(s.detail).toBe("Felt easy — take the bigger jump");
  });

  it("keeps the normal +5 lb jump for an easy-rated hit on an Upper lift", () => {
    const history = [{ weight: 30, reps: 12, effort: -1, date: "2026-01-01" }];
    const s = computeSuggestion(upperWeighted, history);
    expect(s.text).toBe("Try 35 lb");
    expect(s.value).toBe("35");
    expect(s.trend).toBe("up");
    expect(s.detail).toBe("Last: 30 lb × 12 — hit target");
  });
});

describe("computeSuggestion — mesocycle (Phase 15)", () => {
  // 4-week block from Mon 2026-06-01, week 4 (Jun 22–28) the planned deload;
  // the next repeat's weeks 1/4 are Jun 29–Jul 5 / Jul 20–26.
  const cycle = { lengthWeeks: 4, deloadWeeks: [4], startDate: "2026-06-01" };

  it("suggests ~90% of the working weight during a planned deload week", () => {
    const history = [{ weight: 50, reps: 12, effort: null, date: "2026-06-17" }];
    const s = computeSuggestion(upperWeighted, history, { cycle, date: "2026-06-23" });
    expect(s.text).toBe("Deload week — 45 lb");
    expect(s.value).toBe("45");
    expect(s.trend).toBe("flat");
    expect(s.detail).toBe("Planned deload — lighter on purpose");
  });

  it("keeps the deload target anchored to the working weight after the week's first lighter set", () => {
    // The heavier of the last two sessions is the baseline, so recomputing
    // mid-deload-week can't compound 90% of 90%.
    const history = [
      { weight: 50, reps: 12, effort: null, date: "2026-06-17" },
      { weight: 45, reps: 12, effort: null, date: "2026-06-23" }, // first deload set
    ];
    const s = computeSuggestion(upperWeighted, history, { cycle, date: "2026-06-23" });
    expect(s.value).toBe("45");
  });

  it("suggests a shorter hold for timed core moves and easy reps for bodyweight moves", () => {
    const holds = [{ weight: 50, reps: 1, effort: null, date: "2026-06-17" }];
    const hold = computeSuggestion(timedCore, holds, { cycle, date: "2026-06-23" });
    expect(hold.text).toBe("Deload week — hold ~45 sec");
    expect(hold.trend).toBe("flat");

    const reps = [{ weight: 0, reps: 12, effort: null, date: "2026-06-17" }];
    const bw = computeSuggestion(bodyweightRep, reps, { cycle, date: "2026-06-23" });
    expect(bw.text).toBe("Deload week — stop a couple reps short");
    expect(bw.value).toBe("");
    expect(bw.trend).toBe("flat");
  });

  it("excludes planned-deload sessions from the reactive miss count", () => {
    // Miss in week 3, miss during the week-4 deload, now week 1 of the next
    // block: only the week-3 miss counts, so no reactive deload fires…
    const history = [
      { weight: 30, reps: 9, effort: null, date: "2026-06-17" },
      { weight: 27.5, reps: 9, effort: null, date: "2026-06-24" }, // planned deload session
    ];
    const s = computeSuggestion(upperWeighted, history, { cycle, date: "2026-06-30" });
    expect(s.trend).toBe("flat");
    expect(s.text).toBe("Hold at 27.5 lb");

    // …while the identical history with no cycle still deloads reactively.
    const noCycle = computeSuggestion(upperWeighted, history);
    expect(noCycle.trend).toBe("down");
  });

  it("still counts a stall that straddles the deload week — deload sessions are skipped, not scan breakers", () => {
    const history = [
      { weight: 30, reps: 9, effort: null, date: "2026-06-10" }, // week 2 miss
      { weight: 30, reps: 9, effort: null, date: "2026-06-17" }, // week 3 miss
      { weight: 27.5, reps: 12, effort: null, date: "2026-06-24" }, // planned deload hit — neutral
    ];
    const s = computeSuggestion(upperWeighted, history, { cycle, date: "2026-06-30" });
    expect(s.trend).toBe("down");
    expect(s.text.startsWith("Deload to")).toBe(true);
  });

  it("keeps normal progression on accumulation weeks and without opts", () => {
    const history = [{ weight: 30, reps: 12, effort: null, date: "2026-06-10" }];
    const accum = computeSuggestion(upperWeighted, history, { cycle, date: "2026-06-16" });
    expect(accum.text).toBe("Try 35 lb");
    const bare = computeSuggestion(upperWeighted, history);
    expect(bare.text).toBe("Try 35 lb");
  });

  it("falls back to the start suggestion on a deload week with no history", () => {
    const s = computeSuggestion(upperWeighted, [], { cycle, date: "2026-06-23" });
    expect(s.text.startsWith("Start:")).toBe(true);
  });
});

describe("computeSuggestion — timed/bodyweight never deload", () => {
  it("a timed hold with 2 misses in a row still returns a flat 'hold again' suggestion, never a deload", () => {
    const history = [
      { weight: 20, reps: 1, effort: null, date: "2026-01-01" },
      { weight: 20, reps: 1, effort: null, date: "2026-01-08" },
    ];
    const s = computeSuggestion(timedCore, history);
    expect(s.text).not.toMatch(/Deload/);
    expect(s.trend).toBe("flat");
    expect(s.text).toBe("Hold 30-45 sec again — focus on form");
  });

  it("a bodyweight move with 2 misses in a row still returns its normal miss suggestion, never a deload", () => {
    const history = [
      { weight: 0, reps: 5, effort: null, date: "2026-01-01" },
      { weight: 0, reps: 5, effort: null, date: "2026-01-08" },
    ];
    const s = computeSuggestion(bodyweightRep, history);
    expect(s.text).not.toMatch(/Deload/);
    expect(s.trend).toBe("flat");
    expect(s.text).toBe("Aim for 12 again");
  });
});

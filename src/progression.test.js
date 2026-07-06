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

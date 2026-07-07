import { describe, it, expect } from "vitest";
import {
  normalizeCycle,
  cycleWeekKey,
  weekInBlock,
  isDeloadDate,
  cycleStatus,
  cycleStatusLabel,
  applyCycleChange,
} from "./cycleUtils.js";

// Fixture block: 4 weeks repeating from Mon 2026-06-01, week 4 the deload.
//   week 1: Jun 1–7 · week 2: Jun 8–14 · week 3: Jun 15–21 ·
//   week 4 (deload): Jun 22–28 · then week 1 again: Jun 29–Jul 5, …
const CYCLE = { lengthWeeks: 4, deloadWeeks: [4], startDate: "2026-06-01" };

describe("cycleWeekKey", () => {
  it("maps any day of the week to its Monday, matching recap.weekStart", () => {
    expect(cycleWeekKey("2026-07-04")).toBe("2026-06-29"); // Saturday
    expect(cycleWeekKey("2026-06-29")).toBe("2026-06-29"); // Monday maps to itself
    expect(cycleWeekKey("2026-07-05")).toBe("2026-06-29"); // Sunday still belongs to Monday's week
  });
});

describe("normalizeCycle", () => {
  it("passes a valid cycle through", () => {
    expect(normalizeCycle(CYCLE)).toEqual(CYCLE);
  });

  it("returns null for missing/non-object input", () => {
    expect(normalizeCycle(undefined)).toBeNull();
    expect(normalizeCycle(null)).toBeNull();
    expect(normalizeCycle("4 weeks")).toBeNull();
  });

  it("rejects an out-of-range or non-integer block length", () => {
    expect(normalizeCycle({ ...CYCLE, lengthWeeks: 1 })).toBeNull();
    expect(normalizeCycle({ ...CYCLE, lengthWeeks: 13 })).toBeNull();
    expect(normalizeCycle({ ...CYCLE, lengthWeeks: 3.5 })).toBeNull();
  });

  it("rejects a missing or malformed startDate", () => {
    expect(normalizeCycle({ lengthWeeks: 4, deloadWeeks: [4] })).toBeNull();
    expect(normalizeCycle({ ...CYCLE, startDate: "June 1" })).toBeNull();
  });

  it("drops out-of-block deload weeks and rejects when none survive", () => {
    expect(normalizeCycle({ ...CYCLE, deloadWeeks: [0, 4, 9] })).toEqual(CYCLE);
    expect(normalizeCycle({ ...CYCLE, deloadWeeks: [5] })).toBeNull();
    expect(normalizeCycle({ ...CYCLE, deloadWeeks: [] })).toBeNull();
  });

  it("dedupes and sorts deload weeks", () => {
    expect(normalizeCycle({ ...CYCLE, lengthWeeks: 6, deloadWeeks: [6, 3, 3] })).toEqual({
      lengthWeeks: 6,
      deloadWeeks: [3, 6],
      startDate: "2026-06-01",
    });
  });
});

describe("weekInBlock", () => {
  it("derives the 1-based week from startDate, repeating past the block length", () => {
    expect(weekInBlock(CYCLE, "2026-06-01")).toBe(1);
    expect(weekInBlock(CYCLE, "2026-06-14")).toBe(2); // Sunday of week 2
    expect(weekInBlock(CYCLE, "2026-06-22")).toBe(4);
    expect(weekInBlock(CYCLE, "2026-06-29")).toBe(1); // next block repeat
    expect(weekInBlock(CYCLE, "2026-07-07")).toBe(2);
  });

  it("anchors a mid-week startDate to its Monday", () => {
    expect(weekInBlock({ ...CYCLE, startDate: "2026-06-03" }, "2026-06-08")).toBe(2);
  });

  it("returns null for dates before the block started or an invalid cycle", () => {
    expect(weekInBlock(CYCLE, "2026-05-25")).toBeNull();
    expect(weekInBlock(undefined, "2026-06-10")).toBeNull();
    expect(weekInBlock(CYCLE, undefined)).toBeNull();
  });
});

describe("isDeloadDate", () => {
  it("is true exactly inside a deload week, in every block repeat", () => {
    expect(isDeloadDate(CYCLE, "2026-06-21")).toBe(false); // last day of week 3
    expect(isDeloadDate(CYCLE, "2026-06-22")).toBe(true);
    expect(isDeloadDate(CYCLE, "2026-06-28")).toBe(true);
    expect(isDeloadDate(CYCLE, "2026-06-29")).toBe(false);
    expect(isDeloadDate(CYCLE, "2026-07-20")).toBe(true); // week 4 of the next repeat
  });

  it("is safely false without a usable cycle or for pre-block dates", () => {
    expect(isDeloadDate(undefined, "2026-06-22")).toBe(false);
    expect(isDeloadDate({ lengthWeeks: 4 }, "2026-06-22")).toBe(false);
    expect(isDeloadDate(CYCLE, "2026-05-01")).toBe(false);
  });
});

describe("cycleStatus / cycleStatusLabel", () => {
  it("reports the week, deload flag, and distance to the next deload", () => {
    expect(cycleStatus(CYCLE, "2026-06-10")).toEqual({ week: 2, lengthWeeks: 4, deload: false, weeksToDeload: 2 });
    expect(cycleStatus(CYCLE, "2026-06-17")).toEqual({ week: 3, lengthWeeks: 4, deload: false, weeksToDeload: 1 });
    expect(cycleStatus(CYCLE, "2026-06-24")).toEqual({ week: 4, lengthWeeks: 4, deload: true, weeksToDeload: 0 });
    // week 1 looks across the block boundary to the next repeat's deload
    expect(cycleStatus(CYCLE, "2026-06-29")).toEqual({ week: 1, lengthWeeks: 4, deload: false, weeksToDeload: 3 });
  });

  it("returns null when the cycle isn't active", () => {
    expect(cycleStatus(undefined, "2026-06-10")).toBeNull();
    expect(cycleStatus(CYCLE, "2026-05-01")).toBeNull();
  });

  it("labels the three states", () => {
    expect(cycleStatusLabel(cycleStatus(CYCLE, "2026-06-10"))).toBe("Week 2 of 4");
    expect(cycleStatusLabel(cycleStatus(CYCLE, "2026-06-17"))).toBe("Week 3 of 4 — deload next week");
    expect(cycleStatusLabel(cycleStatus(CYCLE, "2026-06-24"))).toBe("Week 4 of 4 — deload week");
    expect(cycleStatusLabel(null)).toBeNull();
  });
});

describe("applyCycleChange", () => {
  const META = { description: "test plan", daysPerWeek: 3 };

  it("creates a block from nothing, defaulting the start to this week's Monday and the deload to the last week", () => {
    const next = applyCycleChange(META, { lengthWeeks: 5, deloadWeeks: null, startDate: null }, "2026-07-04");
    expect(next.cycle).toEqual({ lengthWeeks: 5, deloadWeeks: [5], startDate: "2026-06-29" });
    expect(next.description).toBe("test plan"); // rest of meta untouched
  });

  it("merges partial changes over an existing cycle", () => {
    const meta = { ...META, cycle: CYCLE };
    const next = applyCycleChange(meta, { lengthWeeks: 6, deloadWeeks: null, startDate: null }, "2026-07-04");
    expect(next.cycle).toEqual({ lengthWeeks: 6, deloadWeeks: [4], startDate: "2026-06-01" });
  });

  it("rejects a change that doesn't produce a usable cycle", () => {
    expect(applyCycleChange(META, { lengthWeeks: 1, deloadWeeks: null, startDate: null }, "2026-07-04")).toBeNull();
    const meta = { ...META, cycle: CYCLE };
    expect(applyCycleChange(meta, { lengthWeeks: null, deloadWeeks: [9], startDate: null }, "2026-07-04")).toBeNull();
  });

  it("applies the full-restore shape from inverseCycleChange: put back or remove", () => {
    const withCycle = applyCycleChange(META, { cycle: CYCLE });
    expect(withCycle.cycle).toEqual(CYCLE);
    const removed = applyCycleChange({ ...META, cycle: CYCLE }, { cycle: null });
    expect(removed).toEqual(META);
    expect("cycle" in removed).toBe(false);
  });
});

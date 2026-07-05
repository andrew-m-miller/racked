import { describe, it, expect } from "vitest";
import { epley1RM, isWeighted, e1rmSeries, e1rmStats, sessionsByDate } from "./insights.js";

// ---- fixtures ----
const weightedEx = { name: "Bench Press", cat: "Upper", reps: "8-10", start: "95 lb barbell" };
const timedEx = { name: "Plank", cat: "Core", reps: "30-45 sec", start: "Bodyweight" };
const bodyweightRepEx = { name: "Push-up", cat: "Upper", reps: "12-15", start: "Bodyweight" };

describe("epley1RM", () => {
  it("computes Epley 1RM for a normal set", () => {
    expect(epley1RM(100, 10)).toBe(133.3);
  });

  it("rounds to the nearest 0.1", () => {
    expect(epley1RM(83, 7)).toBe(102.4);
  });

  it("returns null for missing weight", () => {
    expect(epley1RM(undefined, 10)).toBeNull();
  });

  it("returns null for missing reps", () => {
    expect(epley1RM(100, undefined)).toBeNull();
  });

  it("returns null for an empty-string weight", () => {
    expect(epley1RM("", 10)).toBeNull();
  });

  it("returns null for an empty-string reps", () => {
    expect(epley1RM(100, "")).toBeNull();
  });

  it("returns null for zero weight", () => {
    expect(epley1RM(0, 10)).toBeNull();
  });

  it("returns null for zero reps", () => {
    expect(epley1RM(100, 0)).toBeNull();
  });

  it("parses string weight/reps (as stored in logged entries)", () => {
    expect(epley1RM("100", "10")).toBe(133.3);
  });
});

describe("isWeighted", () => {
  it("is true for a normal weighted lift", () => {
    expect(isWeighted(weightedEx)).toBe(true);
  });

  it("is false for a timed core hold", () => {
    expect(isWeighted(timedEx)).toBe(false);
  });

  it("is false for a rep-based bodyweight move", () => {
    expect(isWeighted(bodyweightRepEx)).toBe(false);
  });
});

describe("e1rmSeries", () => {
  it("returns a series aligned index-for-index with history", () => {
    const history = [
      { date: "2026-07-01", weight: "100", reps: "10" },
      { date: "2026-07-02", weight: "110", reps: "5" },
    ];
    const series = e1rmSeries(weightedEx, history);
    expect(series).toHaveLength(history.length);
    expect(series).toEqual([133.3, 128.3]);
  });

  it("carries the nearest known value forward across a gap", () => {
    const history = [
      { date: "2026-07-01", weight: "100", reps: "10" }, // 133.3
      { date: "2026-07-02", weight: "", reps: "" }, // gap
      { date: "2026-07-03", weight: "110", reps: "5" }, // 128.3
    ];
    expect(e1rmSeries(weightedEx, history)).toEqual([133.3, 133.3, 128.3]);
  });

  it("backfills a leading gap from the first computable value", () => {
    const history = [
      { date: "2026-06-30", weight: "", reps: "" }, // leading gap
      { date: "2026-07-01", weight: "100", reps: "10" }, // 133.3
      { date: "2026-07-02", weight: "", reps: "" }, // gap
      { date: "2026-07-03", weight: "110", reps: "5" }, // 128.3
    ];
    expect(e1rmSeries(weightedEx, history)).toEqual([133.3, 133.3, 133.3, 128.3]);
  });

  it("returns null for a non-weighted exercise", () => {
    const history = [{ date: "2026-07-01", weight: "40", reps: "1" }];
    expect(e1rmSeries(timedEx, history)).toBeNull();
    expect(e1rmSeries(bodyweightRepEx, history)).toBeNull();
  });

  it("returns null when no set in history is computable", () => {
    const history = [
      { date: "2026-07-01", weight: "", reps: "" },
      { date: "2026-07-02", weight: "0", reps: "5" },
    ];
    expect(e1rmSeries(weightedEx, history)).toBeNull();
  });
});

describe("e1rmStats", () => {
  it("returns null for a non-weighted exercise", () => {
    const history = [{ date: "2026-07-01", weight: "40", reps: "1" }];
    expect(e1rmStats(timedEx, history)).toBeNull();
  });

  it("computes current as the best e1RM among multiple sets on the most recent date", () => {
    const history = [
      { date: "2026-07-01", weight: "100", reps: "10" }, // 133.3
      { date: "2026-07-01", weight: "105", reps: "10" }, // 140.0 — the max for this date
    ];
    const stats = e1rmStats(weightedEx, history);
    expect(stats.current).toBe(140);
  });

  it("returns a null delta30 when there is only a single session date", () => {
    const history = [
      { date: "2026-07-01", weight: "100", reps: "10" },
      { date: "2026-07-01", weight: "105", reps: "10" },
    ];
    const stats = e1rmStats(weightedEx, history);
    expect(stats.delta30).toBeNull();
  });

  it("anchors delta30 on the session closest to 30 days before the last date", () => {
    const history = [
      { date: "2026-05-01", weight: "100", reps: "10" }, // 133.3 — too far back to be the anchor
      { date: "2026-06-04", weight: "105", reps: "8" }, // 133.0 — exactly 30 days before the last date
      { date: "2026-07-04", weight: "110", reps: "10" }, // 146.7 — most recent
    ];
    const stats = e1rmStats(weightedEx, history);
    expect(stats.current).toBe(146.7);
    // Anchored against 2026-06-04 (133.0), not 2026-05-01 (133.3): 146.7 - 133.0 = 13.7
    expect(stats.delta30).toBe(13.7);
  });
});

describe("sessionsByDate", () => {
  it("groups history by date, oldest first", () => {
    const history = [
      { date: "2026-07-02", weight: "95", reps: "10" },
      { date: "2026-07-01", weight: "90", reps: "8" },
    ];
    const sessions = sessionsByDate(history);
    expect(sessions.map((s) => s.date)).toEqual(["2026-07-01", "2026-07-02"]);
  });

  it("preserves set order within a date", () => {
    const first = { date: "2026-07-01", weight: "90", reps: "8" };
    const second = { date: "2026-07-01", weight: "90", reps: "6" };
    const history = [first, second];
    const sessions = sessionsByDate(history);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets).toEqual([first, second]);
  });
});

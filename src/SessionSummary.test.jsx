// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import SessionSummary, { sessionStats } from "./SessionSummary.jsx";

afterEach(() => {
  cleanup();
});

const TODAY = "2026-07-05";

describe("sessionStats", () => {
  it("sums weight x reps for today's entries, but only for weighted (non-time-based, non-bodyweight) exercises", () => {
    const exercises = [
      { name: "Bench Press", cat: "Upper", reps: "8-10", start: "95 lb barbell" },
      { name: "Plank", cat: "Core", reps: "45 sec", start: "Bodyweight" }, // time-based hold
      { name: "Push Up", cat: "Upper", reps: "12-15", start: "Bodyweight" }, // rep-only bodyweight
    ];
    const logs = {
      "bench-press": [{ date: TODAY, weight: "100", reps: "8" }],
      plank: [{ date: TODAY, weight: "40", reps: "45" }],
      "push-up": [{ date: TODAY, reps: "15" }],
    };
    const { volume } = sessionStats(exercises, logs, TODAY);
    expect(volume).toBe(800); // 100 * 8; the other two are excluded
  });

  it("lists an exercise in levelUps only when there is prior history and today's best beats it", () => {
    const exercises = [
      { name: "Improved Lift", cat: "Upper", reps: "8-10", start: "95 lb barbell" },
      { name: "Flat Lift", cat: "Upper", reps: "8-10", start: "95 lb barbell" },
      { name: "First Time Lift", cat: "Upper", reps: "8-10", start: "95 lb barbell" },
    ];
    const logs = {
      "improved-lift": [
        { date: "2026-07-01", weight: "95", reps: "8" },
        { date: TODAY, weight: "100", reps: "8" },
      ],
      "flat-lift": [
        { date: "2026-07-01", weight: "100", reps: "8" },
        { date: TODAY, weight: "90", reps: "8" }, // worse than prior best
      ],
      "first-time-lift": [{ date: TODAY, weight: "100", reps: "8" }], // no prior history at all
    };
    const { levelUps } = sessionStats(exercises, logs, TODAY);
    expect(levelUps).toEqual(["Improved Lift"]);
  });
});

function makeDay(overrides = {}) {
  return { id: "A", plate: "#3B82F6", ...overrides };
}

describe("SessionSummary (component)", () => {
  it("renders the 'Workout complete' header and the volume via toLocaleString", () => {
    render(
      <SessionSummary
        day={makeDay()}
        stats={{ volume: 1234, levelUps: [] }}
        cardioMin={0}
        durationMin={null}
        totalSets={9}
      />
    );
    expect(screen.getByText("Workout complete")).toBeTruthy();
    expect(screen.getByText("1,234 lb lifted")).toBeTruthy();
  });

  it("shows cardio, duration, and sets line items when provided", () => {
    render(
      <SessionSummary
        day={makeDay()}
        stats={{ volume: 500, levelUps: [] }}
        cardioMin={15}
        durationMin={42}
        totalSets={12}
      />
    );
    expect(screen.getByText("15 min cardio")).toBeTruthy();
    expect(screen.getByText("42 min total")).toBeTruthy();
    expect(screen.getByText("12 sets")).toBeTruthy();
  });

  it("omits cardio and duration items when absent (0 / null)", () => {
    render(
      <SessionSummary
        day={makeDay()}
        stats={{ volume: 500, levelUps: [] }}
        cardioMin={0}
        durationMin={null}
        totalSets={12}
      />
    );
    expect(screen.queryByText(/min cardio/)).toBeNull();
    expect(screen.queryByText(/min total/)).toBeNull();
  });

  it("shows the 'Leveled up:' line only when stats.levelUps is non-empty", () => {
    const { rerender } = render(
      <SessionSummary
        day={makeDay()}
        stats={{ volume: 500, levelUps: [] }}
        cardioMin={0}
        durationMin={null}
        totalSets={9}
      />
    );
    expect(screen.queryByText(/Leveled up:/)).toBeNull();

    rerender(
      <SessionSummary
        day={makeDay()}
        stats={{ volume: 500, levelUps: ["Bench Press", "Plank"] }}
        cardioMin={0}
        durationMin={null}
        totalSets={9}
      />
    );
    expect(screen.getByText("Leveled up: Bench Press, Plank")).toBeTruthy();
  });
});

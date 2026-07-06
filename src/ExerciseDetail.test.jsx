// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ExerciseDetail from "./ExerciseDetail.jsx";

afterEach(() => {
  cleanup();
});

const ex = { name: "Chest Press", cat: "Upper", sets: 3, reps: "12", start: "30–35 lb DB", url: "https://example.com" };

describe("ExerciseDetail", () => {
  it("renders a placeholder (not -Infinity) for a never-logged exercise", () => {
    const { container } = render(<ExerciseDetail ex={ex} history={[]} onClose={() => {}} />);
    expect(container.textContent).not.toContain("Infinity");
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("No sets logged yet.")).toBeTruthy();
    expect(screen.getByText("0 sets · 0 sessions")).toBeTruthy();
  });

  it("shows the all-time best and per-session history when logged", () => {
    const history = [
      { date: "2026-06-01", weight: "30", reps: "12", effort: null, note: null },
      { date: "2026-06-08", weight: "35", reps: "12", effort: null, note: null },
    ];
    render(<ExerciseDetail ex={ex} history={history} onClose={() => {}} />);
    expect(screen.getByText("35")).toBeTruthy(); // all-time best
    expect(screen.getByText("2 sets · 2 sessions")).toBeTruthy();
  });
});

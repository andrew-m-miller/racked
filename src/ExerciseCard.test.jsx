// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ExerciseCard from "./ExerciseCard.jsx";

afterEach(() => {
  cleanup();
});

function makeEx(overrides = {}) {
  return {
    name: "Bench Press",
    cat: "Upper",
    sets: 3,
    reps: "8-10",
    start: "95 lb barbell",
    url: "https://www.youtube.com/watch?v=xyz",
    alts: [],
    ...overrides,
  };
}

function makeHistory() {
  return [
    { date: "2026-06-28", weight: "125", reps: "8", effort: null },
    { date: "2026-07-01", weight: "125", reps: "9", effort: null },
  ];
}

describe("ExerciseCard", () => {
  it("renders the name, category, sets x reps, and the setsDone counter", () => {
    const ex = makeEx();
    render(
      <ExerciseCard
        ex={ex}
        primary={ex}
        history={[]}
        setsDone={1}
        onLog={() => {}}
        onOpenChart={() => {}}
        onSwap={() => {}}
      />
    );
    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.getByText("Upper")).toBeTruthy();
    expect(screen.getByText("3 × 8-10")).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
  });

  it("shows the n/n counter and a checkmark once setsDone reaches sets", () => {
    const ex = makeEx();
    const { container } = render(
      <ExerciseCard
        ex={ex}
        primary={ex}
        history={[]}
        setsDone={3}
        onLog={() => {}}
        onOpenChart={() => {}}
        onSwap={() => {}}
      />
    );
    expect(screen.getByText("3/3")).toBeTruthy();
    // Check icon (lucide) renders as an svg inside the completion pill.
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("Log set calls onLog with the current weight/reps inputs and a null effort", () => {
    const ex = makeEx();
    const onLog = vi.fn();
    render(
      <ExerciseCard
        ex={ex}
        primary={ex}
        history={[]}
        setsDone={0}
        onLog={onLog}
        onOpenChart={() => {}}
        onSwap={() => {}}
      />
    );
    const weightInput = screen.getByPlaceholderText("lb");
    const repsInput = screen.getByPlaceholderText("reps");
    fireEvent.change(weightInput, { target: { value: "100" } });
    fireEvent.change(repsInput, { target: { value: "8" } });
    fireEvent.click(screen.getByText("Log set"));
    expect(onLog).toHaveBeenCalledWith("100", "8", null);
  });

  it("does not call onLog when the reps input is empty", () => {
    const ex = makeEx();
    const onLog = vi.fn();
    render(
      <ExerciseCard
        ex={ex}
        primary={ex}
        history={[]}
        setsDone={0}
        onLog={onLog}
        onOpenChart={() => {}}
        onSwap={() => {}}
      />
    );
    const repsInput = screen.getByPlaceholderText("reps");
    fireEvent.change(repsInput, { target: { value: "" } });
    fireEvent.click(screen.getByText("Log set"));
    expect(onLog).not.toHaveBeenCalled();
  });

  it("toggling the brutal effort chip then logging passes effort 1", () => {
    const ex = makeEx();
    const onLog = vi.fn();
    render(
      <ExerciseCard
        ex={ex}
        primary={ex}
        history={[]}
        setsDone={0}
        onLog={onLog}
        onOpenChart={() => {}}
        onSwap={() => {}}
      />
    );
    fireEvent.click(screen.getByText("brutal"));
    fireEvent.change(screen.getByPlaceholderText("reps"), { target: { value: "8" } });
    fireEvent.click(screen.getByText("Log set"));
    expect(onLog).toHaveBeenCalledWith(expect.anything(), "8", 1);
  });

  it("does not render the swap button when primary has no alts", () => {
    const ex = makeEx({ alts: [] });
    render(
      <ExerciseCard
        ex={ex}
        primary={ex}
        history={[]}
        setsDone={0}
        onLog={() => {}}
        onOpenChart={() => {}}
        onSwap={() => {}}
      />
    );
    expect(screen.queryByLabelText(/Swap /)).toBeNull();
  });

  it("shows the swap button, opens option pills, and swaps to an alt or back to primary", () => {
    const primary = makeEx({
      alts: [{ name: "DB Bench Press", start: "35 lb DB" }],
    });
    const onSwap = vi.fn();
    render(
      <ExerciseCard
        ex={primary}
        primary={primary}
        history={[]}
        setsDone={0}
        onLog={() => {}}
        onOpenChart={() => {}}
        onSwap={onSwap}
      />
    );
    const swapButton = screen.getByLabelText(`Swap ${primary.name} for an alternate`);
    expect(swapButton).toBeTruthy();

    fireEvent.click(swapButton);
    // Both the primary and its alt should now show up as option pills.
    expect(screen.getByText("DB Bench Press")).toBeTruthy();

    fireEvent.click(screen.getByText("DB Bench Press"));
    expect(onSwap).toHaveBeenCalledWith("DB Bench Press");
  });

  it("clicking the primary option pill swaps back with onSwap(null)", () => {
    const primary = makeEx({
      alts: [{ name: "DB Bench Press", start: "35 lb DB" }],
    });
    const swappedEx = { ...primary, name: "DB Bench Press", start: "35 lb DB" };
    const onSwap = vi.fn();
    render(
      <ExerciseCard
        ex={swappedEx}
        primary={primary}
        history={[]}
        setsDone={0}
        onLog={() => {}}
        onOpenChart={() => {}}
        onSwap={onSwap}
      />
    );
    fireEvent.click(screen.getByLabelText(`Swap ${primary.name} for an alternate`));
    // Two pills render: "Bench Press" (primary) and "DB Bench Press" (active/current).
    fireEvent.click(screen.getByText("Bench Press"));
    expect(onSwap).toHaveBeenCalledWith(null);
  });

  it("does not require the weight input for a bodyweight exercise, and reads history for the sparkline threshold", () => {
    const ex = makeEx({ name: "Push Up", start: "Bodyweight", reps: "12-15" });
    render(
      <ExerciseCard
        ex={ex}
        primary={ex}
        history={makeHistory()}
        setsDone={0}
        onLog={() => {}}
        onOpenChart={() => {}}
        onSwap={() => {}}
      />
    );
    expect(screen.queryByPlaceholderText("lb")).toBeNull();
    expect(screen.getByLabelText(`Progress chart for ${ex.name}`)).toBeTruthy();
  });
});

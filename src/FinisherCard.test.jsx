// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import FinisherCard from "./FinisherCard.jsx";

afterEach(() => {
  cleanup();
});

function makeDay(overrides = {}) {
  return { id: "A", finisher: "12-15 min incline treadmill walk", ...overrides };
}

describe("FinisherCard", () => {
  it("shows the 'Finisher —' label plus the day's finisher text", () => {
    const day = makeDay();
    render(<FinisherCard day={day} entries={[]} onLog={() => {}} />);
    // RTL's default text matcher trims/collapses whitespace, so the
    // trailing space in the source JSX ("Finisher — ") normalizes away.
    expect(screen.getByText("Finisher —")).toBeTruthy();
    expect(screen.getByText(day.finisher)).toBeTruthy();
  });

  it("logging minutes and an optional mode calls onLog(minutes, mode)", () => {
    const onLog = vi.fn();
    render(<FinisherCard day={makeDay()} entries={[]} onLog={onLog} />);
    fireEvent.change(screen.getByPlaceholderText("min"), { target: { value: "15" } });
    fireEvent.change(screen.getByPlaceholderText("machine / mode (optional)"), {
      target: { value: "Bike" },
    });
    fireEvent.click(screen.getByText("Log"));
    expect(onLog).toHaveBeenCalledWith(15, "Bike");
  });

  it("does not call onLog when minutes is empty", () => {
    const onLog = vi.fn();
    render(<FinisherCard day={makeDay()} entries={[]} onLog={onLog} />);
    fireEvent.click(screen.getByText("Log"));
    expect(onLog).not.toHaveBeenCalled();
  });

  it("does not call onLog when minutes is zero or negative", () => {
    const onLog = vi.fn();
    render(<FinisherCard day={makeDay()} entries={[]} onLog={onLog} />);
    fireEvent.change(screen.getByPlaceholderText("min"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Log"));
    fireEvent.change(screen.getByPlaceholderText("min"), { target: { value: "-5" } });
    fireEvent.click(screen.getByText("Log"));
    expect(onLog).not.toHaveBeenCalled();
  });

  it("shows the 'min done' summary and the last entry's note instead of the inputs, once logged", () => {
    const entries = [
      { date: "2026-07-01", reps: "10", note: "Bike" },
      { date: "2026-07-05", reps: "12", note: "Incline walk" },
    ];
    render(<FinisherCard day={makeDay()} entries={entries} onLog={() => {}} />);
    expect(screen.getByText("22 min done · Incline walk")).toBeTruthy();
    expect(screen.queryByPlaceholderText("min")).toBeNull();
    expect(screen.queryByText("Log")).toBeNull();
  });

  it("omits the note suffix when the last entry has no note", () => {
    const entries = [{ date: "2026-07-05", reps: "12", note: "" }];
    render(<FinisherCard day={makeDay()} entries={entries} onLog={() => {}} />);
    expect(screen.getByText("12 min done")).toBeTruthy();
  });
});

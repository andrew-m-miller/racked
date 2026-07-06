// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import RestTimer from "./RestTimer.jsx";

const NOW = new Date("2026-07-05T12:00:00").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RestTimer", () => {
  it("shows the mm:ss countdown and a +30s button while resting", () => {
    render(<RestTimer endsAt={NOW + 90_000} onExtend={() => {}} onSkip={() => {}} />);
    expect(screen.getByText("1:30")).toBeTruthy();
    expect(screen.getByText("+30s")).toBeTruthy();
    expect(screen.getByText("Skip")).toBeTruthy();
  });

  it("shows GO and swaps the button to Dismiss (no +30s) once the timer has ended", () => {
    render(<RestTimer endsAt={NOW - 1000} onExtend={() => {}} onSkip={() => {}} />);
    expect(screen.getByText("GO")).toBeTruthy();
    expect(screen.queryByText("+30s")).toBeNull();
    expect(screen.getByText("Dismiss")).toBeTruthy();
    expect(screen.queryByText("Skip")).toBeNull();
  });

  it("clicking Skip calls onSkip", () => {
    const onSkip = vi.fn();
    render(<RestTimer endsAt={NOW + 90_000} onExtend={() => {}} onSkip={onSkip} />);
    fireEvent.click(screen.getByText("Skip"));
    expect(onSkip).toHaveBeenCalled();
  });

  it("counts down as the interval ticks", () => {
    render(<RestTimer endsAt={NOW + 90_000} onExtend={() => {}} onSkip={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("1:00")).toBeTruthy();
  });
});

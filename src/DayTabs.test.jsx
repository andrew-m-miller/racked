// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import DayTabs from "./DayTabs.jsx";

afterEach(() => {
  cleanup();
});

function makeDays() {
  return [
    { id: "A", label: "Day 1", plate: "#3B82F6" },
    { id: "B", label: "Day 2", plate: "#FACC15" },
    { id: "C", label: "Day 3", plate: "#22C55E" },
  ];
}

describe("DayTabs", () => {
  it("renders one tab per day, showing both the id and the label", () => {
    render(<DayTabs days={makeDays()} activeDay="A" onSelect={() => {}} />);
    for (const d of makeDays()) {
      expect(screen.getByText(d.id)).toBeTruthy();
      expect(screen.getByText(d.label)).toBeTruthy();
    }
  });

  it("highlights the active day with a solid background and its plate border", () => {
    render(<DayTabs days={makeDays()} activeDay="B" onSelect={() => {}} />);
    const activeButton = screen.getByText("Day 2").closest("button");
    const inactiveButton = screen.getByText("Day 1").closest("button");
    expect(activeButton.style.background).toBe("rgb(27, 30, 34)"); // #1B1E22
    expect(activeButton.style.border).toContain("rgb(250, 204, 21)"); // #FACC15
    expect(inactiveButton.style.background).toBe("transparent");
    expect(inactiveButton.style.border).toContain("rgb(42, 46, 51)"); // #2A2E33
  });

  it("calls onSelect with the clicked day's id", () => {
    const onSelect = vi.fn();
    render(<DayTabs days={makeDays()} activeDay="A" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Day 3").closest("button"));
    expect(onSelect).toHaveBeenCalledWith("C");
  });
});

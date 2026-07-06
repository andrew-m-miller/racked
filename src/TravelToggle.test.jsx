// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import TravelToggle from "./TravelToggle.jsx";

afterEach(() => {
  cleanup();
});

describe("TravelToggle", () => {
  it("renders the three fixed profile chips", () => {
    render(<TravelToggle profile={null} onSelect={() => {}} swappedCount={0} unmatchedNames={[]} />);
    expect(screen.getByText("Bodyweight")).toBeTruthy();
    expect(screen.getByText("Dumbbells")).toBeTruthy();
    expect(screen.getByText("Hotel gym")).toBeTruthy();
  });

  it("selects a profile on tap and clears it on a second tap of the active chip", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<TravelToggle profile={null} onSelect={onSelect} swappedCount={0} unmatchedNames={[]} />);
    fireEvent.click(screen.getByText("Dumbbells"));
    expect(onSelect).toHaveBeenCalledWith("dumbbells");

    rerender(<TravelToggle profile="dumbbells" onSelect={onSelect} swappedCount={0} unmatchedNames={[]} />);
    fireEvent.click(screen.getByText("Dumbbells"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("shows no status line while off", () => {
    render(<TravelToggle profile={null} onSelect={() => {}} swappedCount={3} unmatchedNames={["Lateral Raises"]} />);
    expect(screen.queryByText(/swapped for this session/)).toBe(null);
    expect(screen.queryByText(/No match/)).toBe(null);
  });

  it("summarizes the active day's swaps and names the exercises with no match", () => {
    render(
      <TravelToggle profile="bodyweight" onSelect={() => {}} swappedCount={3} unmatchedNames={["Cable Bicep Curl"]} />
    );
    expect(screen.getByText(/3 exercises swapped for this session/)).toBeTruthy();
    expect(screen.getByText(/No match for Cable Bicep Curl/)).toBeTruthy();
  });

  it("says so when nothing on the active day needed a swap", () => {
    render(<TravelToggle profile="hotel" onSelect={() => {}} swappedCount={0} unmatchedNames={[]} />);
    expect(screen.getByText(/already fit — nothing to swap/)).toBeTruthy();
  });
});

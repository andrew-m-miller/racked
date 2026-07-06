// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ExerciseDetail from "./ExerciseDetail.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

  it("offers no edit affordance without handlers or when sets lack ids", () => {
    const history = [{ date: "2026-06-01", weight: "30", reps: "12", effort: null, note: null }];
    // No handlers wired (e.g. a caller that predates Phase 12).
    const { unmount } = render(<ExerciseDetail ex={ex} history={history} onClose={() => {}} />);
    expect(screen.queryByLabelText(/Edit sets from/)).toBeNull();
    unmount();
    // Handlers wired but the entry has no id (pre-Phase-12 offline snapshot).
    render(<ExerciseDetail ex={ex} history={history} onClose={() => {}} onUpdateSet={() => {}} onDeleteSet={() => {}} />);
    expect(screen.queryByLabelText(/Edit sets from/)).toBeNull();
  });

  it("saves an edited set with the new weight/reps", () => {
    const history = [
      { id: 1, date: "2026-06-01", weight: "855", reps: "12", effort: null, note: null },
      { id: 2, date: "2026-06-01", weight: "185", reps: "10", effort: 1, note: null },
    ];
    const onUpdateSet = vi.fn();
    render(<ExerciseDetail ex={ex} history={history} onClose={() => {}} onUpdateSet={onUpdateSet} onDeleteSet={() => {}} />);

    fireEvent.click(screen.getByLabelText(/Edit sets from/));
    const [weightInput] = screen.getAllByLabelText("Set weight");
    fireEvent.change(weightInput, { target: { value: "185" } });
    const [saveBtn] = screen.getAllByLabelText("Save set");
    fireEvent.click(saveBtn);

    expect(onUpdateSet).toHaveBeenCalledWith(1, { weight: "185", reps: "12", effort: null, note: null });
  });

  it("disables save until something changed", () => {
    const history = [{ id: 1, date: "2026-06-01", weight: "30", reps: "12", effort: null, note: null }];
    render(<ExerciseDetail ex={ex} history={history} onClose={() => {}} onUpdateSet={() => {}} onDeleteSet={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Edit sets from/));
    expect(screen.getByLabelText("Save set").disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Set reps"), { target: { value: "10" } });
    expect(screen.getByLabelText("Save set").disabled).toBe(false);
  });

  it("deletes a set after confirmation, and not when cancelled", () => {
    const history = [{ id: 7, date: "2026-06-01", weight: "30", reps: "12", effort: null, note: null }];
    const onDeleteSet = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ExerciseDetail ex={ex} history={history} onClose={() => {}} onUpdateSet={() => {}} onDeleteSet={onDeleteSet} />);

    fireEvent.click(screen.getByLabelText(/Edit sets from/));
    fireEvent.click(screen.getByLabelText("Delete set"));
    expect(onDeleteSet).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByLabelText("Delete set"));
    expect(onDeleteSet).toHaveBeenCalledWith(7);
  });

  it("hides the weight box for rep-only bodyweight moves in edit mode", () => {
    const bw = { name: "Hanging Knee Raise", cat: "Core", sets: 3, reps: "12", start: "Bodyweight", url: "https://example.com" };
    const history = [{ id: 1, date: "2026-06-01", weight: "", reps: "12", effort: null, note: null }];
    render(<ExerciseDetail ex={bw} history={history} onClose={() => {}} onUpdateSet={() => {}} onDeleteSet={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Edit sets from/));
    expect(screen.queryByLabelText("Set weight")).toBeNull();
    expect(screen.getByLabelText("Set reps")).toBeTruthy();
  });
});

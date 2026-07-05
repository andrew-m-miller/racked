// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { parseHash, useHashRoute } from "./useHashRoute.js";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("parseHash", () => {
  it("falls back to the workout view with no exerciseSlug for empty, root, or garbage hashes", () => {
    expect(parseHash("")).toEqual({ view: "workout", exerciseSlug: null });
    expect(parseHash("#/")).toEqual({ view: "workout", exerciseSlug: null });
    expect(parseHash("#/nonsense")).toEqual({ view: "workout", exerciseSlug: null });
  });

  it("recognizes the progress, plan, and onboard routes", () => {
    expect(parseHash("#/progress")).toEqual({ view: "progress", exerciseSlug: null });
    expect(parseHash("#/plan")).toEqual({ view: "edit", exerciseSlug: null });
    expect(parseHash("#/onboard")).toEqual({ view: "onboard", exerciseSlug: null });
  });

  it("resolves an exercise-detail hash to the workout view with the slug", () => {
    expect(parseHash("#/exercise/goblet-squat")).toEqual({
      view: "workout",
      exerciseSlug: "goblet-squat",
    });
  });

  it("URL-decodes the exercise slug", () => {
    expect(parseHash("#/exercise/db%20bench")).toEqual({
      view: "workout",
      exerciseSlug: "db bench",
    });
  });

  it("falls through to workout with no slug when the exercise path has an extra segment", () => {
    expect(parseHash("#/exercise/a/b")).toEqual({ view: "workout", exerciseSlug: null });
  });
});

// Tiny probe component so useHashRoute's stateful wiring (initial read,
// navigate(), and the hashchange listener) gets exercised too, not just the
// pure parseHash helper it wraps. Built with createElement (no JSX) so this
// file can stay a plain .js module per the naming above.
function Probe() {
  const [route, navigate] = useHashRoute();
  return React.createElement(
    "div",
    null,
    React.createElement("span", { "data-testid": "view" }, route.view),
    React.createElement("span", { "data-testid": "slug" }, route.exerciseSlug ?? ""),
    React.createElement("button", { onClick: () => navigate("/progress") }, "go-progress")
  );
}

describe("useHashRoute", () => {
  it("reads the initial route from location.hash", () => {
    window.location.hash = "#/plan";
    render(React.createElement(Probe));
    expect(screen.getByTestId("view").textContent).toBe("edit");
  });

  it("navigate() updates location.hash and the returned route", async () => {
    window.location.hash = "";
    render(React.createElement(Probe));
    expect(screen.getByTestId("view").textContent).toBe("workout");
    fireEvent.click(screen.getByText("go-progress"));
    expect(window.location.hash).toBe("#/progress");
    // jsdom fires "hashchange" as a real (macrotask) event rather than
    // synchronously, so flush a tick before checking the listener-driven route.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByTestId("view").textContent).toBe("progress");
  });

  it("updates the route in response to an external hashchange event", () => {
    window.location.hash = "";
    render(React.createElement(Probe));
    act(() => {
      window.location.hash = "#/exercise/goblet-squat";
      window.dispatchEvent(new window.Event("hashchange"));
    });
    expect(screen.getByTestId("view").textContent).toBe("workout");
    expect(screen.getByTestId("slug").textContent).toBe("goblet-squat");
  });
});

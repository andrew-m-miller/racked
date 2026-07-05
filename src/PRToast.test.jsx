// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PRToast from "./PRToast.jsx";

afterEach(() => {
  cleanup();
});

describe("PRToast", () => {
  it("renders the message text", () => {
    render(<PRToast message="New PR: Bench Press 135 lb" />);
    expect(screen.getByText("New PR: Bench Press 135 lb")).toBeTruthy();
  });
});

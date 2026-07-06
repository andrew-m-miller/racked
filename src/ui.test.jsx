// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { StatBlock, SectionTitle, CopyButton } from "./ui.jsx";

afterEach(() => {
  cleanup();
});

describe("StatBlock", () => {
  it("renders value, label, and the optional sub line", () => {
    render(<StatBlock label="current (lb)" value="185" sub="Jun 30" />);
    expect(screen.getByText("185")).toBeTruthy();
    expect(screen.getByText("current (lb)")).toBeTruthy();
    expect(screen.getByText("Jun 30")).toBeTruthy();
  });

  it("omits the sub line when not given", () => {
    const { container } = render(<StatBlock label="best streak" value="4" />);
    expect(container.textContent).toBe("4best streak"); // value + label, nothing else
  });
});

describe("SectionTitle", () => {
  it("renders its children as the heading", () => {
    render(<SectionTitle icon={null}>Bodyweight</SectionTitle>);
    expect(screen.getByRole("heading", { name: "Bodyweight" })).toBeTruthy();
  });
});

describe("CopyButton", () => {
  it("flips to Copied after a click", () => {
    render(<CopyButton text="hello" label="Copy URL" />);
    fireEvent.click(screen.getByRole("button", { name: /copy url/i }));
    // jsdom has no clipboard; copyText degrades to a no-op and the
    // confirmation state still renders.
    return screen.findByText("Copied");
  });
});

import { describe, it, expect } from "vitest";
import { makeBuddyCode, normalizeBuddyCode, buddyTodayLine } from "./buddyUtils.js";

describe("makeBuddyCode", () => {
  it("maps bytes onto the unambiguous alphabet, grouped XXXX-XXXX", () => {
    expect(makeBuddyCode(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]))).toBe("ABCD-EFGH");
  });

  it("uses only the first 8 bytes and never ambiguous characters", () => {
    const code = makeBuddyCode(Uint8Array.from({ length: 16 }, (_, i) => i * 17));
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
    expect(code).not.toMatch(/[01OIL]/);
  });

  it("round-trips through its own normalizer", () => {
    const code = makeBuddyCode(Uint8Array.from([250, 99, 3, 47, 180, 21, 66, 133]));
    expect(normalizeBuddyCode(code)).toBe(code);
  });
});

describe("normalizeBuddyCode", () => {
  it("canonicalizes casing, spaces, and dashes", () => {
    expect(normalizeBuddyCode("abcd-efgh")).toBe("ABCD-EFGH");
    expect(normalizeBuddyCode("  ab cd ef gh ")).toBe("ABCD-EFGH");
    expect(normalizeBuddyCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("rejects anything that can't be a code", () => {
    expect(normalizeBuddyCode("")).toBeNull();
    expect(normalizeBuddyCode(null)).toBeNull();
    expect(normalizeBuddyCode("ABC-DEF")).toBeNull(); // 6 chars
    expect(normalizeBuddyCode("ABCD-EFGH-JKMN")).toBeNull(); // 12 chars
  });
});

describe("buddyTodayLine", () => {
  it("reads 'not yet' with no sets (or no summary at all)", () => {
    expect(buddyTodayLine(null)).toBe("Not trained yet today");
    expect(buddyTodayLine({ sets: 0, dayName: null, done: false })).toBe("Not trained yet today");
  });

  it("announces a finished day by name, falling back without one", () => {
    expect(buddyTodayLine({ sets: 14, dayName: "Push", done: true })).toBe("Finished Push day ✓");
    expect(buddyTodayLine({ sets: 14, dayName: null, done: true })).toBe("Finished today's workout ✓");
  });

  it("shows in-progress set counts, singular and plural", () => {
    expect(buddyTodayLine({ sets: 1, dayName: "Legs", done: false })).toBe("Training today — 1 set logged");
    expect(buddyTodayLine({ sets: 6, dayName: "Legs", done: false })).toBe("Training today — 6 sets logged");
  });
});

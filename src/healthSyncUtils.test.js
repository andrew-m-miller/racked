import { describe, it, expect } from "vitest";
import { makeSyncToken, healthSyncEndpoint, tokenedHealthSyncUrl } from "./healthSyncUtils.js";

describe("makeSyncToken", () => {
  it("hex-encodes the bytes, zero-padded", () => {
    expect(makeSyncToken(Uint8Array.from([0, 1, 15, 16, 255]))).toBe("00010f10ff");
  });

  it("turns 24 random bytes into a 48-char token", () => {
    const token = makeSyncToken(Uint8Array.from({ length: 24 }, (_, i) => i));
    expect(token).toHaveLength(48);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });
});

describe("healthSyncEndpoint / tokenedHealthSyncUrl", () => {
  it("builds the edge-function URL, tolerating a trailing slash", () => {
    expect(healthSyncEndpoint("https://abc.supabase.co")).toBe("https://abc.supabase.co/functions/v1/health-sync");
    expect(healthSyncEndpoint("https://abc.supabase.co/")).toBe("https://abc.supabase.co/functions/v1/health-sync");
  });

  it("appends the token as a query param", () => {
    expect(tokenedHealthSyncUrl("https://abc.supabase.co", "deadbeef")).toBe(
      "https://abc.supabase.co/functions/v1/health-sync?token=deadbeef"
    );
  });
});

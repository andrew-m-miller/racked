import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array, pushSupportState } from "./pushUtils.js";

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url (with -/_ and no padding) to the raw bytes", () => {
    // 0x04 0xfb 0xef 0x3e — exercises both url-safe replacement chars
    expect(Array.from(urlBase64ToUint8Array("BPvvPg"))).toEqual([4, 251, 239, 62]);
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });

  it("round-trips a realistic 65-byte P-256 public key", () => {
    const bytes = Uint8Array.from({ length: 65 }, (_, i) => (i * 7) % 256);
    const b64url = Buffer.from(bytes).toString("base64url");
    expect(Array.from(urlBase64ToUint8Array(b64url))).toEqual(Array.from(bytes));
  });
});

describe("pushSupportState", () => {
  const full = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, isIOS: false, isStandalone: false };

  it("is ready when the whole stack exists", () => {
    expect(pushSupportState(full)).toBe("ready");
  });

  it("is ready in an installed iOS PWA (iOS exposes PushManager only there)", () => {
    expect(pushSupportState({ ...full, isIOS: true, isStandalone: true })).toBe("ready");
  });

  it("asks iOS Safari tabs to install first", () => {
    expect(pushSupportState({ ...full, hasPushManager: false, isIOS: true })).toBe("needs-install");
  });

  it("is unsupported elsewhere without PushManager", () => {
    expect(pushSupportState({ ...full, hasPushManager: false })).toBe("unsupported");
  });
});

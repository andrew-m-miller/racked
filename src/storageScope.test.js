// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

// Same localStorage polyfill rationale as syncQueue.test.js: Node 26's global
// stub isn't functional and vitest's jsdom env doesn't override it.
function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}
Object.defineProperty(globalThis, "localStorage", {
  value: createMemoryStorage(),
  configurable: true,
  writable: true,
});

// The module holds the scope in module state, so each test gets a fresh copy.
async function freshModule() {
  vi.resetModules();
  return import("./storageScope.js");
}

beforeEach(() => {
  localStorage.clear();
});

describe("storageScope", () => {
  it("returns unscoped keys until a scope is set", async () => {
    const { scopedKey } = await freshModule();
    expect(scopedKey("racked-pending-v1")).toBe("racked-pending-v1");
  });

  it("suffixes keys with the user id once scoped", async () => {
    const { setStorageScope, scopedKey } = await freshModule();
    setStorageScope("user-a");
    expect(scopedKey("racked-pending-v1")).toBe("racked-pending-v1:user-a");
  });

  it("adopts legacy unscoped values on first scope-set and removes the originals", async () => {
    const { setStorageScope, scopedKey } = await freshModule();
    localStorage.setItem("racked-pending-v1", '[{"table":"logs"}]');
    localStorage.setItem("racked-coach-auto", "1");
    setStorageScope("user-a");
    expect(localStorage.getItem(scopedKey("racked-pending-v1"))).toBe('[{"table":"logs"}]');
    expect(localStorage.getItem(scopedKey("racked-coach-auto"))).toBe("1");
    expect(localStorage.getItem("racked-pending-v1")).toBeNull();
    expect(localStorage.getItem("racked-coach-auto")).toBeNull();
  });

  it("never overwrites an existing scoped value with a legacy one", async () => {
    const { setStorageScope, scopedKey } = await freshModule();
    localStorage.setItem("racked-pending-v1:user-a", "[]");
    localStorage.setItem("racked-pending-v1", '[{"table":"logs"}]');
    setStorageScope("user-a");
    expect(localStorage.getItem(scopedKey("racked-pending-v1"))).toBe("[]");
  });

  it("isolates two users on the same browser", async () => {
    const { setStorageScope, scopedKey } = await freshModule();
    setStorageScope("user-a");
    localStorage.setItem(scopedKey("racked-snapshot-v1"), '{"logs":{}}');
    setStorageScope("user-b");
    expect(localStorage.getItem(scopedKey("racked-snapshot-v1"))).toBeNull();
    expect(localStorage.getItem("racked-snapshot-v1:user-a")).toBe('{"logs":{}}');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isNetworkError,
  runOrQueue,
  flush,
  discardOps,
  rewriteOps,
  pendingOps,
  pendingCount,
  onPendingChange,
} from "./syncQueue";

const QUEUE_KEY = "racked-pending-v1";

// Node 26 ships its own (non-functional without --localstorage-file) global
// `localStorage`, and vitest's jsdom environment doesn't yet know to override
// it (it's not in vitest's window-key allowlist). Swap in a minimal in-memory
// Storage-like polyfill so the module under test — which only calls
// getItem/setItem — behaves like a real browser localStorage.
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

beforeEach(() => {
  localStorage.clear();
});

describe("isNetworkError", () => {
  it("is true when navigator.onLine is false, regardless of the error", () => {
    const spy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    expect(isNetworkError(new Error("new row violates row-level security policy"))).toBe(true);
    expect(isNetworkError(undefined)).toBe(true);
    spy.mockRestore();
  });

  it("is true for a TypeError", () => {
    expect(isNetworkError(new TypeError("whatever"))).toBe(true);
  });

  it("matches the known browser fetch-failure wordings case-insensitively", () => {
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("FAILED TO FETCH"))).toBe(true);
    expect(isNetworkError(new Error("Load failed"))).toBe(true);
    expect(isNetworkError(new Error("NetworkError when attempting to fetch resource."))).toBe(true);
  });

  it("is false for a real server/RLS error", () => {
    expect(isNetworkError(new Error("new row violates row-level security policy"))).toBe(false);
  });

  it("is false for a message that merely mentions connection/timeout", () => {
    expect(isNetworkError(new Error("connection timeout"))).toBe(false);
  });
});

describe("runOrQueue", () => {
  it("returns {queued: false} and keeps the queue empty when perform succeeds", async () => {
    const perform = vi.fn().mockResolvedValue(undefined);
    const op = { table: "logs", id: 1 };
    const result = await runOrQueue(perform, op);
    expect(result).toEqual({ queued: false });
    expect(perform).toHaveBeenCalledTimes(1);
    expect(perform).toHaveBeenCalledWith(op);
    expect(pendingOps()).toEqual([]);
  });

  it("queues the op when perform rejects with a network error", async () => {
    const perform = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const op = { table: "logs", id: 1 };
    const result = await runOrQueue(perform, op);
    expect(result).toEqual({ queued: true });
    expect(pendingOps()).toEqual([op]);
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY))).toEqual([op]);
  });

  it("propagates a non-network error and queues nothing", async () => {
    const perform = vi.fn().mockRejectedValue(new Error("new row violates row-level security policy"));
    const op = { table: "logs", id: 1 };
    await expect(runOrQueue(perform, op)).rejects.toThrow("row-level security");
    expect(pendingOps()).toEqual([]);
  });

  it("keeps FIFO order: a new op lines up behind an already-queued one", async () => {
    // Seed the queue with op A via a network failure.
    const opA = { table: "logs", id: "A" };
    const seedPerform = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    await runOrQueue(seedPerform, opA);
    expect(pendingOps()).toEqual([opA]);

    // Now push op B while the queue is non-empty; the resulting flush should
    // drain both, in insertion order.
    const opB = { table: "logs", id: "B" };
    const order = [];
    const drainPerform = vi.fn().mockImplementation(async (op) => {
      order.push(op.id);
    });
    const result = await runOrQueue(drainPerform, opB);

    expect(result).toEqual({ queued: false });
    expect(order).toEqual(["A", "B"]);
    expect(pendingOps()).toEqual([]);
  });

  it("no-rollback: a permanently-rejected earlier op does not fail the current write", async () => {
    // Queue op A directly.
    const opA = { table: "logs", id: "A" };
    localStorage.setItem(QUEUE_KEY, JSON.stringify([opA]));

    const opB = { table: "logs", id: "B" };
    // perform permanently rejects whatever it's given (simulating A being
    // rejected by the server during the internal flush).
    const perform = vi.fn().mockRejectedValue(new Error("bad payload"));

    // runOrQueue must NOT reject even though flush(perform) throws internally.
    const result = await runOrQueue(perform, opB);
    expect(result).toEqual({ queued: true });

    // A was dropped (poisoned), B remains queued for the next flush attempt.
    expect(pendingOps()).toEqual([opB]);
  });
});

describe("flush", () => {
  it("drains all ops in order on success and returns 0", async () => {
    const ops = [{ id: 1 }, { id: 2 }, { id: 3 }];
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));

    const order = [];
    const perform = vi.fn().mockImplementation(async (op) => {
      order.push(op.id);
    });

    const remaining = await flush(perform);
    expect(remaining).toBe(0);
    expect(order).toEqual([1, 2, 3]);
    expect(pendingOps()).toEqual([]);
  });

  it("stops and retries on a network failure, leaving the rest queued", async () => {
    const ops = [{ id: 1 }, { id: 2 }, { id: 3 }];
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));

    const perform = vi.fn().mockImplementation(async (op) => {
      if (op.id === 2) throw new Error("Failed to fetch");
    });

    const remaining = await flush(perform);
    expect(remaining).toBe(2);
    expect(pendingOps()).toEqual([{ id: 2 }, { id: 3 }]);
  });

  it("drops a permanently-rejected op and throws, keeping the rest", async () => {
    const ops = [{ id: 1 }, { id: 2 }, { id: 3 }];
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));

    const err = new Error("new row violates row-level security policy");
    const perform = vi.fn().mockImplementation(async (op) => {
      if (op.id === 1) throw err;
    });

    await expect(flush(perform)).rejects.toThrow(err.message);
    expect(pendingOps()).toEqual([{ id: 2 }, { id: 3 }]);
  });
});

describe("discardOps", () => {
  it("drops matching ops and keeps the rest", () => {
    const ops = [
      { table: "logs", id: 1 },
      { table: "weighIns", id: 2 },
      { table: "logs", id: 3 },
    ];
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));

    discardOps((op) => op.table === "logs");

    expect(pendingOps()).toEqual([{ table: "weighIns", id: 2 }]);
    expect(pendingCount()).toBe(1);
  });
});

describe("rewriteOps", () => {
  it("rewrites a matching op in place, preserving queue order", () => {
    const ops = [
      { table: "logs", cid: "c-1", row: { weight: 855 } },
      { table: "logs", cid: "c-2", row: { weight: 100 } },
    ];
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));

    rewriteOps((op) => (op.cid === "c-1" ? { ...op, row: { ...op.row, weight: 185 } } : op));

    expect(pendingOps()).toEqual([
      { table: "logs", cid: "c-1", row: { weight: 185 } },
      { table: "logs", cid: "c-2", row: { weight: 100 } },
    ]);
  });

  it("drops an op when the rewriter returns null and notifies listeners", () => {
    const ops = [
      { table: "logs", cid: "c-1", row: {} },
      { table: "logs", cid: "c-2", row: {} },
    ];
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));

    const counts = [];
    const unsubscribe = onPendingChange((n) => counts.push(n));

    rewriteOps((op) => (op.cid === "c-1" ? null : op));

    expect(pendingOps()).toEqual([{ table: "logs", cid: "c-2", row: {} }]);
    expect(counts).toEqual([2, 1]);
    unsubscribe();
  });
});

describe("onPendingChange", () => {
  it("fires immediately with the current count and on subsequent writes", async () => {
    const opA = { id: 1 };
    localStorage.setItem(QUEUE_KEY, JSON.stringify([opA]));

    const calls = [];
    const unsubscribe = onPendingChange((count) => calls.push(count));

    expect(calls).toEqual([1]);

    const perform = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    await runOrQueue(perform, { id: 2 });
    expect(calls).toEqual([1, 2]);

    unsubscribe();
    discardOps(() => true);
    expect(calls).toEqual([1, 2]); // no more notifications after unsubscribe
  });
});

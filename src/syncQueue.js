import { scopedKey } from "./storageScope.js";

// Offline sync queue: writes that fail because the network is down are parked
// in localStorage and replayed, in order, once the connection returns. Set
// logging at the gym keeps working through dead-zones — the optimistic UI
// update stands and the row uploads later. The key is scoped per user
// (storageScope.js) so a queued write can never replay under another account.
const QUEUE_KEY = "racked-pending-v1";

const listeners = new Set();

function read() {
  try {
    return JSON.parse(localStorage.getItem(scopedKey(QUEUE_KEY))) || [];
  } catch {
    return [];
  }
}

function write(ops) {
  try {
    localStorage.setItem(scopedKey(QUEUE_KEY), JSON.stringify(ops));
  } catch {
    // localStorage full/unavailable — the op still ran optimistically in the UI
  }
  for (const cb of listeners) cb(ops.length);
}

export function pendingOps() {
  return read();
}

export function pendingCount() {
  return read().length;
}

// Subscribe to queue-size changes; fires immediately with the current count.
export function onPendingChange(cb) {
  listeners.add(cb);
  cb(read().length);
  return () => listeners.delete(cb);
}

// Network failures (offline, DNS, dropped connection) are queueable; anything
// else (RLS violation, bad payload) is a real error the caller must see.
// Browsers word fetch failures differently: Chrome "Failed to fetch",
// Safari "Load failed", Firefox "NetworkError...".
export function isNetworkError(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  // fetch() rejects with a TypeError when the connection itself fails.
  if (err instanceof TypeError) return true;
  // Match only the known fetch-failure wordings, not any message that happens
  // to mention "connection"/"timeout" (a real server error must still surface).
  return /failed to fetch|networkerror|load failed/i.test(String(err?.message || err));
}

// Run `op` through `perform`, queueing it if the network is down. Anything
// already queued keeps FIFO order — new writes line up behind it so rows
// reach the database in the order they were logged.
export async function runOrQueue(perform, op) {
  const q = read();
  if (q.length > 0) {
    write([...q, op]);
    // This op is now safely queued; the flush is a best-effort drain. If an
    // *earlier* op is permanently rejected, flush drops it and throws — but
    // that must not fail (and roll back) the write we just accepted, which will
    // still retry on the next flush.
    try {
      await flush(perform);
    } catch {
      // earlier op dropped inside flush — current op stays queued
    }
    return { queued: pendingCount() > 0 };
  }
  try {
    await perform(op);
    return { queued: false };
  } catch (err) {
    if (isNetworkError(err)) {
      write([op]);
      return { queued: true };
    }
    throw err;
  }
}

// Replay queued ops in order. A network failure stops the run (the rest stay
// queued for next time); an op the server permanently rejects is dropped so
// it can't wedge the queue, and the error propagates to the caller.
export async function flush(perform) {
  let q = read();
  while (q.length > 0) {
    try {
      await perform(q[0]);
    } catch (err) {
      if (isNetworkError(err)) return q.length;
      write(q.slice(1));
      throw err;
    }
    q = q.slice(1);
    write(q);
  }
  return 0;
}

// Drop queued ops matching `predicate` (e.g. all "logs" ops on history reset).
export function discardOps(predicate) {
  write(read().filter((op) => !predicate(op)));
}

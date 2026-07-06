// Per-user scoping for the app's localStorage keys (offline queue, cold-start
// snapshot, opt-in flags). Without it, two accounts sharing a browser bleed
// into each other: a sign-out with offline writes still queued would replay
// them as the *next* account to sign in (rows insert with user_id defaulting
// to auth.uid()), and an offline cold start could render the previous
// account's snapshot. main.jsx sets the scope from the session before any
// storage-backed component mounts; until it's set, keys are unscoped (which
// only ever happens signed-out, where nothing reads them).

// Keys that predate scoping. On the first scope-set they're adopted by the
// signing-in user — pre-Phase-11 data belonged to this device's only account —
// and the legacy copies are removed so they can't leak to a later account.
const LEGACY_BASES = ["racked-pending-v1", "racked-snapshot-v1", "racked-push-on", "racked-coach-auto"];

let suffix = "";

export function setStorageScope(userId) {
  const next = userId ? `:${userId}` : "";
  if (next === suffix) return;
  suffix = next;
  if (!suffix) return;
  try {
    for (const base of LEGACY_BASES) {
      const legacy = localStorage.getItem(base);
      if (legacy !== null && localStorage.getItem(base + suffix) === null) {
        localStorage.setItem(base + suffix, legacy);
      }
      localStorage.removeItem(base);
    }
  } catch {
    // storage blocked — scoped reads just start empty
  }
}

export function scopedKey(base) {
  return base + suffix;
}

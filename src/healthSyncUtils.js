// Pure helpers for the Apple Health / Health Connect bridge (Phase 10).
// A web PWA has no HealthKit API, so the bridge is an Apple Shortcut (or
// Health Connect flow) holding a per-user sync token and talking to the
// health-sync edge function. These helpers mint the token and build the
// URLs the setup UI shows; the token itself is stored via src/storage.js.

// Hex-encode random bytes into the sync token. The caller supplies the
// bytes (crypto.getRandomValues in the app) so this stays deterministic
// under test. 24 bytes → 48 hex chars, plenty against guessing.
export function makeSyncToken(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Base URL of the health-sync edge function for this Supabase project.
export function healthSyncEndpoint(supabaseUrl) {
  return `${String(supabaseUrl || "").replace(/\/+$/, "")}/functions/v1/health-sync`;
}

// The one URL a Shortcut needs — POST a weigh-in to it, GET workouts from
// it. The token rides as a query param because that's the path of least
// resistance in the Shortcuts editor; the function also accepts it as a
// Bearer header for anything that can set one.
export function tokenedHealthSyncUrl(supabaseUrl, token) {
  return `${healthSyncEndpoint(supabaseUrl)}?token=${token}`;
}

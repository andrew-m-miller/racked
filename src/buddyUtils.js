// Pure helpers for the buddy system (Phase 14). The pairing flow is the
// sync_tokens pattern with a human-typed secret: you mint a code, your buddy
// types it in, redeeming is consent. These helpers mint/normalize the code
// and phrase the card's status lines; storage lives in src/storage.js and
// the server contract in supabase/functions/buddy-status.

// Codes are typed across a text thread, so the alphabet drops the characters
// people misread (0/O, 1/I/L) and the canonical form is grouped XXXX-XXXX.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// The caller supplies the bytes (crypto.getRandomValues in the app) so this
// stays deterministic under test — same convention as makeSyncToken. Eight
// chars over a 31-symbol alphabet ≈ 8e11 codes: unguessable enough for a
// short-lived invite that redeeming deletes, and short enough to type.
export function makeBuddyCode(bytes) {
  const chars = Array.from(bytes.slice(0, 8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

// Canonicalize whatever the buddy pasted/typed — any casing, spaces, missing
// or extra dashes — back to XXXX-XXXX. Null when it can't be a code (the UI
// disables the redeem button rather than sending garbage to the server).
export function normalizeBuddyCode(input) {
  const raw = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : null;
}

// The card's "today" line, from buddy-status's presence-only summary
// {sets, dayName, done}. Counts and a day name — never weights or reps.
export function buddyTodayLine(today) {
  if (!today || !today.sets) return "Not trained yet today";
  if (today.done) return `Finished ${today.dayName ? `${today.dayName} day` : "today's workout"} ✓`;
  return `Training today — ${today.sets} set${today.sets === 1 ? "" : "s"} logged`;
}

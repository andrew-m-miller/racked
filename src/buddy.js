import { supabase } from "./supabaseClient.js";
import { localDateKey } from "./planUtils.js";
import { scopedKey } from "./storageScope.js";

// Client for the buddy-status Edge Function (Phase 14). Kept out of the view
// components so nothing under src/*.jsx talks to Supabase directly — same
// boundary rule as coach.js and push.js. All buddy data the app ever sees is
// this function's presence-level summary; there is no client-side path to
// another user's rows.

// Cheap sync gate for the session-complete nudge, mirroring push.js's
// racked-push-on flag: logging the last set never awaits a link lookup.
// Kept current by every status/redeem response; worst case it's stale and
// push-send resolves "no link" server-side as a quiet no-op.
const BUDDY_FLAG = "racked-buddy-on";

export function buddyLinked() {
  try {
    return localStorage.getItem(scopedKey(BUDDY_FLAG)) === "1";
  } catch {
    return false;
  }
}

function setBuddyFlag(on) {
  try {
    if (on) localStorage.setItem(scopedKey(BUDDY_FLAG), "1");
    else localStorage.removeItem(scopedKey(BUDDY_FLAG));
  } catch {
    // storage blocked — the card still works, the nudge just won't fire
  }
}

async function invokeBuddyStatus(body) {
  const { data, error } = await supabase.functions.invoke("buddy-status", {
    body: { ...body, today: localDateKey() },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  setBuddyFlag(!!data?.linked);
  return data;
}

// {linked:false} or {linked:true, since, buddy:{name, streak, weekSessions,
// target, today:{sets, dayName, done}}}. Throws when the function isn't
// deployed/reachable — BuddySection treats that as "not linked" (fail-soft).
export function fetchBuddyStatus() {
  return invokeBuddyStatus({ action: "status" });
}

// Redeem a code your buddy minted; success returns the linked status payload.
export function redeemBuddyCode(code) {
  return invokeBuddyStatus({ action: "redeem", code });
}

// Fire-and-forget: tell push-send the session is complete so it can notify
// the linked buddy's devices. Day name only — the payload carries no numbers.
export function sendBuddyDonePush(dayName) {
  supabase.functions.invoke("push-send", { body: { type: "buddy-done", day: dayName } }).catch(() => {});
}

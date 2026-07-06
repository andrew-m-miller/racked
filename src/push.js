import { supabase } from "./supabaseClient.js";
import { urlBase64ToUint8Array, pushSupportState } from "./pushUtils.js";
import { savePushSubscription, deletePushSubscription } from "./storage.js";
import { scopedKey } from "./storageScope.js";

// Browser wiring for web push (Phase 10). Kept out of the view components so
// nothing under src/*.jsx talks to the Supabase client directly — same
// boundary rule as coach.js. Two notification moments ride on this: the
// rest timer finishing while the app is backgrounded (scheduleRestPush) and
// the weekly check-in nudge (sent by the push-send function via cron).

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

// Cheap sync gate for the per-set rest-timer call: the enable/disable toggle
// keeps this flag current, so logging a set never awaits a subscription
// lookup. Worst case the flag is stale and the server pushes to a pruned
// subscription — the push service just drops it.
const PUSH_FLAG = "racked-push-on";

export function pushEnabled() {
  try {
    return localStorage.getItem(scopedKey(PUSH_FLAG)) === "1";
  } catch {
    return false;
  }
}

function setPushFlag(on) {
  try {
    if (on) localStorage.setItem(scopedKey(PUSH_FLAG), "1");
    else localStorage.removeItem(scopedKey(PUSH_FLAG));
  } catch {
    // storage blocked — pushes still work, rest-timer scheduling just won't
  }
}

// What the Notifications UI should offer on this device.
export function detectPushSupport() {
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone =
    navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  return pushSupportState({
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    isIOS,
    isStandalone,
  });
}

// The registered service worker, or null. getRegistration (not .ready) so a
// dev server — where vite-plugin-pwa registers no worker — fails fast
// instead of hanging forever.
async function registration() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg?.active ? reg : null;
}

export async function getPushSubscription() {
  try {
    const reg = await registration();
    const sub = (await reg?.pushManager.getSubscription()) ?? null;
    setPushFlag(!!sub);
    return sub;
  } catch {
    return null;
  }
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked — allow them for Racked in system settings.");
  const reg = await registration();
  if (!reg) throw new Error("No service worker yet — notifications need the installed/production app.");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  await savePushSubscription(sub.toJSON());
  setPushFlag(true);
}

export async function disablePush() {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  setPushFlag(false);
  if (!sub) return;
  // Row first: if unsubscribe then fails, the orphan is a dead endpoint the
  // sender prunes, not a live subscription with no row.
  await deletePushSubscription(sub.endpoint);
  await sub.unsubscribe();
}

// Fire-and-forget: ask push-send to deliver "rest over" to this user's
// devices in `seconds`. The service worker suppresses it if the app is
// visible, so this only surfaces when the phone is locked or backgrounded.
export function scheduleRestPush(seconds) {
  supabase.functions.invoke("push-send", { body: { type: "timer", seconds } }).catch(() => {});
}

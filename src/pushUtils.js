// Pure helpers for web push (Phase 10). The browser wiring — service worker
// lookup, PushManager.subscribe, permission prompts — lives in src/push.js;
// what's here is the logic that can run (and be tested) anywhere.

// Decode a base64url VAPID public key into the Uint8Array that
// PushManager.subscribe wants as applicationServerKey.
export function urlBase64ToUint8Array(base64url) {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Classify what the Notifications UI should offer.
//   "ready"         — the full push stack is available
//   "needs-install" — iOS Safari tab: push only works from the installed
//                     home-screen app, so tell the user to install first
//   "unsupported"   — no push in this browser at all
export function pushSupportState({ hasServiceWorker, hasPushManager, hasNotification, isIOS, isStandalone }) {
  if (hasServiceWorker && hasPushManager && hasNotification) return "ready";
  if (isIOS && !isStandalone) return "needs-install";
  return "unsupported";
}

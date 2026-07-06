// Push handlers for the Racked service worker (Phase 10).
//
// vite-plugin-pwa generates sw.js itself (generateSW), so push handling
// can't live there — instead the workbox config importScripts this file
// into the generated worker. Payloads come from the push-send edge
// function as JSON: {title, body, tag, url, suppressIfVisible}.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text() };
  }
  event.waitUntil(
    (async () => {
      // Rest-timer pushes are redundant while the app is on screen — the
      // in-page timer bar is already showing. Locked/backgrounded devices
      // report no visible client, which is exactly when the push matters.
      if (data.suppressIfVisible) {
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (wins.some((w) => w.visibilityState === "visible")) return;
      }
      await self.registration.showNotification(data.title || "Racked", {
        body: data.body || "",
        tag: data.tag || undefined, // same-tag pushes collapse (e.g. extended rest timers)
        icon: "icon-192.png", // relative to the SW scope, /racked/
        badge: "icon-192.png",
        vibrate: [200, 100, 200],
        data: { url: data.url || "./" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = wins.find((w) => "focus" in w);
      if (existing) {
        if (existing.url !== url && "navigate" in existing) await existing.navigate(url).catch(() => {});
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })()
  );
});

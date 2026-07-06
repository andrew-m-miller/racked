import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/racked/",
  // Vitest piggybacks on this config; pure-logic tests run in node, and the
  // few browser-global cases (localStorage, navigator) opt into jsdom with a
  // per-file `// @vitest-environment jsdom` docblock. The npm scripts pin TZ
  // to a non-UTC zone so date tests catch UTC-drift regressions.
  test: {
    environment: "node",
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-180.png"],
      manifest: {
        name: "Racked",
        short_name: "Racked",
        description: "Workout tracker with built-in progression and a weekly AI coach",
        theme_color: "#101214",
        background_color: "#101214",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Cache the Google Fonts stylesheets + font files so the installed app
        // renders correctly in a gym dead-zone. Supabase calls are untouched
        // (cross-origin, no route here) — offline writes go through the sync
        // queue in storage.js instead.
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        // generateSW owns sw.js, so the push/notificationclick handlers ride
        // in via importScripts (public/push-sw.js).
        importScripts: ["push-sw.js"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-css" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-files",
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});

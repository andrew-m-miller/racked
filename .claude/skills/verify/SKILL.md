---
name: verify
description: Drive the running Racked app end-to-end in a headless browser, past the magic-link auth wall, using a disposable Supabase test user. Use when a change needs in-app verification (flow-level UI, routing, storage wiring) rather than just `npm test`.
---

# Verifying Racked in a real browser

The app is a Supabase-authed SPA — the blocker is the magic-link sign-in wall.
The recipe: mint a disposable password user with the service-role key, inject
its session into localStorage, and drive the app with Playwright against the
system Chrome (no browser download needed).

## Recipe

1. **Dev server:** `npm run dev -- --port 5199 --strictPort` (background). App
   URL is `http://localhost:5199/racked/` — note the `/racked/` base path.
2. **Service-role key:** the Supabase CLI is authenticated on this machine:
   `npx supabase projects api-keys --project-ref fugrbmkhuhphskitpvzc -o json`
   → take the `service_role` entry (`anon` is there too). Write it to a
   scratchpad file; never echo keys into the transcript.
3. **Test user (never the real account):** in a scratchpad Node script with
   `@supabase/supabase-js`: `admin.auth.admin.createUser({ email, password,
   email_confirm: true })`, then `signInWithPassword` via the anon client to
   get a session. Delete any stale user with the same email first.
4. **Session injection:** `npm i playwright-core` in the scratchpad and
   `chromium.launch({ channel: "chrome", headless: true })` (uses installed
   Chrome). Before `page.goto`, `page.addInitScript` setting localStorage key
   `sb-fugrbmkhuhphskitpvzc-auth-token` to `JSON.stringify(session)` —
   AuthGate then sees the session on load.
5. **Cleanup (always, in a finally):** delete the test user's rows from
   `logs`, `weigh_ins`, and `plan` (filter `user_id`), then
   `admin.auth.admin.deleteUser(id)`.

## Flows worth driving

- Fresh user lands on `#/onboard`; Skip saves the seed plan and returns to `#/`.
- Log a set → counter increments, rest timer bar appears (Skip dismisses it).
- Two sets logged → sparkline exists; deep link `#/exercise/<slug>` opens the
  detail view; its back button returns to `#/`.
- Header "Progress" → `#/progress`; browser Back returns to the workout; a
  hard reload at `#/progress` stays on progress (URL-addressable views).
- Guards: a garbage hash falls back to the workout; `#/onboard` with an
  existing plan bounces to `#/`.

## Gotchas

- `getByRole("button", { name: "Progress" })` is ambiguous — the sparkline
  buttons are labeled "Progress chart for <name>"; use `exact: true`.
- Data loads are async; give the page ~1–1.5s after `goto` before asserting.
- Logged weights change between sets — the progression engine suggests a new
  weight mid-session once a set hits the top of the rep range; that's by
  design, not a bug.

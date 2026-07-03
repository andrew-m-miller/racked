# Phase 4 — Platform Hardening

Make the app installable, resilient to gym dead-zones, and lock down the database.

## Features

### 1. PWA + offline logging
- Web app manifest + service worker so the app installs to the phone home screen
  and opens full-screen like a native app.
- **Offline sync queue**: sets logged without signal are queued locally
  (IndexedDB/localStorage) and flushed to Supabase when the connection returns.
  The optimistic-update pattern in `RackedTracker.jsx` already gives the instant
  UI; this makes the rollback path unnecessary for transient network failures.
- A small "n sets pending sync" indicator replaces the current hard error banner
  when offline.
- Vite PWA plugin (`vite-plugin-pwa`) handles the service worker + manifest
  generation; needs `base: "/racked/"` awareness for GitHub Pages.

### 2. Supabase auth (magic link)
- Replace the open "Allow all" RLS policy with real per-user policies.
- Magic-link email sign-in (no password to remember, works well on mobile).
- Add a `user_id` column to `logs` (and Phase 2's `weigh_ins`), defaulting to
  `auth.uid()`; backfill existing rows to the owner account.
- Motivation: the anon key ships in the public JS bundle, so today anyone who
  finds it can read/write/delete the whole log history.

### 3. Cardio finisher logging
- The finisher is currently display-only. Add a log control to the finisher card
  (minutes + optional machine/mode) stored in `logs` under a per-day finisher slug.
- Finisher completion counts toward the session summary and (Phase 2) calendar,
  so a "complete" workout means lifts **and** cardio — which is the point of the
  program.

## Data / schema changes
- `logs` / `weigh_ins`: add `user_id uuid default auth.uid()`; new RLS policies
  scoped to `auth.uid() = user_id`.
- No new tables; finisher entries reuse `logs` (`weight` = null, `reps` = minutes).

## Out of scope
- Multi-user features beyond securing the single owner account.

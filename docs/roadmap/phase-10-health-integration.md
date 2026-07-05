# Phase 10 — Health & Device Integration

Lean into what the app already is: an installed PWA you open on your phone at the
gym. This phase connects it to the device's health data and notification
surfaces so bodyweight and workouts flow both ways and the app can reach out
when it's useful. This is the most exploratory phase — the web platform's access
to Apple Health in particular is constrained, so the doc names those limits up
front rather than assuming a clean API.

## Features

### 1. Bodyweight import
- Pull weigh-ins from the device's health store instead of typing them: Apple
  Health / Google Health Connect as the source, writing into the existing
  `weigh_ins` table through `src/storage.js`.
- **Reality check (iOS):** a web PWA has no direct HealthKit API. The practical
  bridge is an Apple **Shortcuts** automation that reads weight and POSTs it to
  a small Supabase endpoint (or writes via the app's import hook). Android's
  Health Connect is more directly reachable. The doc should prototype the
  Shortcuts path first and treat it as the baseline.

### 2. Workout export
- Write completed sessions (the "complete" workout = lifts + finisher) back to
  the health store as strength-training + cardio entries, so the ring/activity
  data reflects training logged here.
- Same platform constraint as import — likely a Shortcuts/Health Connect bridge
  rather than an in-page API on iOS.

### 3. Notifications
- Web push (where supported — note iOS only allows it for installed PWAs) for
  two moments: the rest timer completing when the app is backgrounded, and a
  weekly nudge to review the coach check-in (Phase 9) or log a weigh-in.
- Requires a push subscription store and a sender; the Supabase edge-function
  layer that already runs the coach is the natural home for the weekly send.

## Data / schema changes
- Possibly a `push_subscriptions` table (`user_id`, `endpoint`, `keys jsonb`),
  RLS-scoped per user, for the notification sender. Health sync itself reuses
  `weigh_ins` / `logs` — no new tables for the data flow.

## Out of scope
- Wrapping the app as a native iOS/Android build (a Capacitor/native shell would
  unlock real HealthKit, but that's a distribution change beyond this phase).
- Real-time wearable data (heart rate during a set), form feedback.
- Third-party fitness platform sync (Strava, etc.).

## Dependency
- The installed-PWA + auth foundation (Phase 4, shipped). Notifications pair best
  with Phase 9's scheduled weekly coach run as the thing worth notifying about.

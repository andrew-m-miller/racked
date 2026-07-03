# Phase 1 — In-Workout Quality of Life

Make the app a gym companion rather than a logbook. All four features are
implemented in `src/RackedTracker.jsx`.

## Features

### 1. Rest timer
- A 90-second countdown starts automatically after every logged set, shown as a
  sticky bar at the bottom of the screen.
- `+30s` extends the rest; `Skip` dismisses it. When it hits zero it vibrates
  (where supported), flips to a green "GO" state, and auto-dismisses.
- The set that completes the workout doesn't start a timer — the session
  summary takes over instead.

### 2. Per-set progress
- Each exercise card shows `n/sets` logged today; the check badge now means
  *all* sets are done, not just one.
- The day header and progress bar count sets (e.g. `9/17 sets today`) instead
  of exercises touched.

### 3. Auto day selection
- On load, the app opens the day you're mid-way through (sets logged today), or
  the next day in the A→B→C rotation after your last session.
- Day detection uses a majority vote across the latest session's entries, since
  some exercises (Seated Cable Row) appear on more than one day.

### 4. Session summary
- When every set of the day is logged, a "Workout complete" card appears in the
  day's plate color: total pounds lifted, session duration (when the session
  started in this app session), set count, and any exercises that beat their
  all-time best ("Leveled up").

## Out of scope
- Charts, streaks, bodyweight (Phase 2); progression-logic changes (Phase 3);
  finisher logging (Phase 4).

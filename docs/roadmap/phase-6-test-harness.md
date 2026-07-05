# Phase 6 — Test Harness & Safety Net

Give the pure-logic core a regression net before building on top of it. The app
has no tests today — every change is verified by hand in the browser — and the
July timezone bug (`toISOString()` giving tomorrow's date to an evening
US-timezone user) is exactly the class of defect a two-line test catches
forever. This phase is the foundation the later phases lean on: with the core
covered, `RackedTracker.jsx` can be decomposed (Phase 8) without fear.

## Features

### 1. Vitest setup
- Add `vitest` (+ `jsdom` for the few browser-global cases) and a `test` /
  `test:watch` script. Vitest reuses the existing `vite.config.js`, so there's
  near-zero new config and no separate build path.
- Tests live beside the code as `*.test.js`, or under `src/__tests__/`.
- Keep it dependency-light — no React Testing Library yet; this phase covers
  pure modules only.

### 2. Progression engine coverage (`src/progression.js`)
- `targetNumber` parsing across rep-range formats.
- `computeSuggestion`: upper +5 / lower +10 at the top of the rep range, timed
  core-hold increments, rep-based bodyweight bumps, the 2-miss 10% deload, and
  the effort modifiers (brutal-hit holds + half-miss, easy-hit doubles the lower
  jump).
- Guard the ordering fix: the `missScore` scan must stay below the timed/
  bodyweight early returns and count weighted reps only.

### 3. Offline queue coverage (`src/syncQueue.js`)
- `isNetworkError`: offline flag, `TypeError`, and the three browser fetch-
  failure wordings classify as queueable; a real server/RLS error does not.
- `runOrQueue`: FIFO ordering when something is already queued, and the
  guarantee that a *newly accepted* write isn't rolled back when an older op is
  permanently rejected during the opportunistic flush.
- `flush`: stop-and-retry on network failure, drop-and-throw on permanent
  rejection so a poisoned op can't wedge the queue; `discardOps` filtering.

### 4. Date & recap helpers
- `localDateKey` / `dayForDate` local-midnight correctness (the regression from
  the timezone fix) — a fixed clock in a non-UTC offset must resolve to the
  local calendar day.
- `weekVolume` orphan-slug guard (renamed/dropped exercises don't inflate
  volume) and the timed/bodyweight exclusions.
- A `buildWeeklyRecap` snapshot over a fixed fixture so the paste-block format
  can't drift silently.

### 5. CI gate
- Run the suite on pull requests (a `test` job in a `ci.yml`, or a step ahead of
  the existing deploy) so red tests block a merge. Deploy still fires only on
  `main`.

## Data / schema changes
- None. Tests are dev-only; nothing ships in the production bundle.

## Out of scope
- Component render tests and end-to-end browser tests (revisit after Phase 8's
  decomposition makes components testable in isolation).
- Testing the edge functions (Deno) — separate toolchain, separate effort.

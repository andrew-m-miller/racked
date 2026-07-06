# Phase 13 — Travel Mode

The most common way a program dies isn't motivation — it's a week at a hotel
with two dumbbells, followed by "the streak's dead anyway." The pieces mostly
exist: `exercises.json` carries curated `alts` per exercise, `RackedTracker`
already owns per-session swap state, and the streak/consistency calendar gives
the feature its payoff. This phase adds a one-tap equipment-constrained session
mode that bulk-swaps today's plan to viable alternates without touching the
plan itself.

## Features

### 1. Equipment profiles
- A "limited equipment" toggle when starting a session, with a few fixed
  profiles: **bodyweight only**, **dumbbells only**, **hotel gym**
  (dumbbells + machines + bench).
- Selecting a profile walks today's plan and swaps each exercise to its best
  matching alt for the available equipment, reusing the existing per-session
  swap mechanism — same flow, same logging, no plan edit, resets with the
  session.

### 2. Equipment tags on alternates
- Each alt (and each primary) gains an equipment tag
  (`barbell | dumbbell | machine | cable | bodyweight`) so profile matching is
  data-driven, not name-guessing.
- One-time tagging pass over the bundled `exercises.json` seed, adding
  bodyweight/dumbbell variants where a lift has none.
- `plan-designer` emits tags on generated plans going forward; existing
  AI-generated plan rows won't have them, so keep read-site fallbacks (the
  established jsonb pattern) — untagged exercises fall back to a client-side
  name-based guess, and an unmatched exercise simply offers the manual swap
  picker.

### 3. Progression continuity
- Swapped sets log under the substitute's own slug (already true for manual
  swaps), so dumbbell-press history accumulates across trips instead of
  contaminating the barbell lift, and `computeSuggestion` works from the
  substitute's own last entry. Back home, the original lift's suggestion picks
  up exactly where it left off.

### 4. Streak protection
- A fully-swapped session counts as complete (lift sets + finisher, as today),
  so travel weeks don't punch holes in the consistency calendar.
- Verify the deload scan can't count a travel session as a "miss" against the
  original lifts — it shouldn't (the scan is per-slug), but the test suite
  should pin it.

## Data / schema changes
- None. Equipment tags live inside the `plan` jsonb and the bundled seed;
  old rows load unchanged via read-site fallbacks.

## Out of scope
- Per-gym saved equipment inventories or a custom equipment picker — fixed
  profiles only until real use demands more.
- Permanently editing the plan for a long trip (the plan editor already covers
  that).
- Auto-detecting travel (location, calendar). The toggle is the feature.

## Dependency
- The swap mechanism and per-slug logging (Phase 3, shipped); the consistency
  calendar (Phase 2, shipped) as the motivation surface.

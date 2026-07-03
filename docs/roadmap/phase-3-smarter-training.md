# Phase 3 — Smarter Training

Make the progression engine react to how training actually felt, handle real gym
conditions (machine taken), and let the plan itself evolve without a code deploy.

## Features

### 1. Perceived-effort flag
- Optional one-tap rating when logging a set: **easy / right / brutal**.
- Stored as a new nullable `effort` column on `logs` (values `-1 / 0 / 1`).
- Feeds `computeSuggestion()`:
  - "brutal" + target hit → hold weight one more session instead of incrementing
  - "easy" + target hit → allow a double increment on lower-body lifts
  - "brutal" counts as a half-miss toward the 2-miss deload trigger
- Skippable — logging with no rating behaves exactly like today.

### 2. Exercise substitutions
- A swap button on each card for when equipment is taken, offering 1–2 curated
  alternates per exercise (e.g. Seated Cable Row → Chest-Supported DB Row,
  Leg Press → Goblet Squat, Lat Pulldown → Assisted Pull-Up).
- Substitutes log under their own slug so each movement keeps a clean history and
  its own progression suggestion.
- Alternates defined alongside the plan data, not hard-coded in the component.

### 3. Plan editor (plan moves to Supabase)
- Move the source of truth for the plan from `exercises.json` into a Supabase
  `plan` table; `exercises.json` becomes the seed/fallback.
- A simple edit UI (behind a long-press or settings screen) to adjust sets, reps,
  starting weights, swap exercises in/out, and reorder — from the phone, no deploy.
- This is the unlock for future programming changes (e.g. moving to a 4-day split)
  without touching code.

## Data / schema changes
- `logs`: add nullable `effort` smallint.
- New `plan` table (or a single JSON row to start — matching how the app consumes
  it today, lowest-friction migration).

## Out of scope
- Charts/streaks (Phase 2), offline/auth (Phase 4), AI plan suggestions (stretch).

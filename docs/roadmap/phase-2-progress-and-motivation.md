# Phase 2 — Progress & Motivation

Make months of logged data visible and motivating, and track the metric the whole
program exists for: bodyweight.

## Features

### 1. Per-exercise progress charts
- Lightweight sparkline on each exercise card showing the weight (or hold-time) trend.
- Tapping the sparkline opens a fuller chart view: weight over time, with deloads and
  level-ups visually marked.
- No heavy chart dependency — hand-rolled SVG or a tiny library, keeping bundle size
  and the inline-style design system intact.

### 2. Consistency calendar & streaks
- A month grid colored with the plate colors (Day A blue `#3B82F6`, Day B yellow
  `#FACC15`, Day C green `#22C55E`) showing which workout was done on which day.
- Current streak / longest streak counters (a "streak week" = 3 sessions logged).
- For a weight-loss program, adherence is the primary metric — this view makes it
  the most prominent thing in the app after the workout itself.

### 3. Bodyweight tracking
- Weekly weigh-in log: a small input on a new Progress screen, stored in a new
  Supabase `weigh_ins` table (`date`, `weight_lb`).
- Trend line with 7-day smoothing so daily noise doesn't discourage.
- Surfaced as a compact stat (current, 30-day delta) at the top of the Progress view.

### 4. PR detection & celebration
- When a logged set beats the all-time best weight (or hold time) for that exercise,
  flag it in the moment — a small celebratory state on the card.
- All-time PRs listed per exercise in the chart view.

## Data / schema changes
- New `weigh_ins` table (same open-RLS pattern as `logs` until Phase 4 adds auth).
- No changes to the existing `logs` table; charts, streaks, and PRs derive entirely
  from data already being logged.

## Out of scope
- Progression-logic changes (Phase 3).
- Offline support / auth (Phase 4).

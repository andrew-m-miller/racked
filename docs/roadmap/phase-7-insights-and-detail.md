# Phase 7 — In-App Insights & Exercise Detail

Surface the intelligence the app already computes. `recap.js` and
`progression.js` derive volume trends, hit/miss, stalls, and next-session
suggestions — but today that only leaves the app as a paste-for-Claude text
block or an edge-function call. This phase renders it directly, and gives each
lift a real drill-down. Almost entirely additive reads over existing `logs` /
`weigh_ins` data — no schema changes.

## Features

### 1. Weekly insight strip
- A compact panel on the main view (above or beside the recap) showing what
  `buildWeeklyRecap` already calculates: sessions done vs planned, this week's
  lifting volume with the week-over-week delta, and days not yet trained.
- **Stall flags**: any lift where `computeSuggestion` returns `trend: "down"`
  (heading for or in a deload) gets called out by name — the app already knows,
  it just isn't saying so in the UI.
- Pure derivation; reuses the recap's `exerciseIndex` / `weekVolume` helpers so
  there's one source of truth for the numbers.

### 2. Exercise detail view
- Tapping a card's sparkline opens a full-history view for that exercise:
  weight (or hold-time / reps, per `exMetric`) over time as a hand-rolled SVG
  chart, matching the inline-style system — no chart dependency.
- All-time PRs listed, with deloads and level-ups marked on the line, and the
  raw per-session sets below.
- Reachable for primaries *and* swapped-in alternates, since each logs under its
  own slug and keeps its own history.

### 3. Estimated 1RM (e1RM)
- Compute e1RM per weighted set (Epley: `weight × (1 + reps/30)`) and plot it as
  a second, smoother line in the detail view — a cleaner progress signal than
  raw top sets across changing rep targets.
- Show current e1RM (and 30-day delta) as a headline stat on the detail view.
- Weighted lifts only; timed holds and bodyweight moves keep their existing
  metric.

### 4. Data export
- One-tap export of `logs` + `weigh_ins` + `plan` to CSV and/or JSON, read
  straight through `src/storage.js`.
- Insurance for a single-user app whose data lives in one Supabase project, and
  the groundwork for a future re-import.

## Data / schema changes
- None. Insights, charts, e1RM, and export all derive from data already logged.

## Out of scope
- Component decomposition / routing for the new views (Phase 8).
- Changes to the coaching flow (Phase 9).
- Cross-exercise / whole-body analytics beyond per-lift and the weekly strip.

# Phase 9 — Unified AI Coaching

The app has two overlapping coaching surfaces. The Tier-1 recap
(`buildWeeklyRecap`) assembles a paste-for-Claude text block; the Tier-2 `coach`
edge function returns `{narrative, suggestions[]}` with one-tap `plan_change`
applied via `handleApplyPlanChange`. That's two stories for one job. This phase
converges on the in-app coach as primary and demotes the paste-block to a
fallback/export, so there's a single coherent weekly-review flow.

## Features

### 1. In-app coach as the primary surface
- Make the `coach` edge function's narrative + suggestions the default weekly
  view: the recap renders the coach's read of the week inline, not just a block
  to copy elsewhere.
- The paste-for-Claude text becomes a secondary "copy raw recap" affordance —
  kept for offline / no-key situations and power users, but no longer the main
  path.

### 2. Consistent one-tap apply
- Ensure every `plan_change` a suggestion can carry routes through
  `handleApplyPlanChange` and writes via the `plan` editor path, with a clear
  applied/undo state — so acting on advice never means hand-editing the plan.

### 3. Scheduled weekly check-in
- Optional Supabase cron that runs the recap → `coach` pipeline off-peak (e.g.
  Sunday night) and caches the result, so Monday's app open shows a ready
  review instead of waiting on a cold call.
- Naturally reuses the edge function that already holds the `ANTHROPIC_API_KEY`
  server-side; no key ever reaches the static bundle.

### 4. Coach history
- Persist each week's narrative + accepted suggestions so the coaching thread
  has continuity — "last week I told you to hold Goblet Squat; you did, here's
  what happened" — rather than a stateless one-shot each time.

## Data / schema changes
- Optional `coach_runs` table (`user_id`, `week_start`, `narrative jsonb`,
  `applied jsonb`) for the scheduled cache and history, RLS-scoped to
  `auth.uid() = user_id` like the other per-user tables. Fail-soft: absence just
  means live-only, no history — matching the app's existing load-fail-soft
  pattern.

## Out of scope
- A free-form chat UI inside the app.
- Multi-week periodization / mesocycle planning.
- Model or prompt changes to the existing `plan-designer` / `find-videos`
  functions.

## Dependency
- The existing `coach` edge function (stretch doc, shipped) and Phase 3's plan
  editor for applying suggestions. Richer once Phase 7's insights exist to feed
  the prompt.

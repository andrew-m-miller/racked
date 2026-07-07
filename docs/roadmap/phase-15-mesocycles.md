# Phase 15 — Mesocycle Programming

The progression engine is linear-forever with a reactive 10% deload after two
misses — the model everyone stalls out of around months 3–6. This phase adds
planned block structure: repeating cycles (e.g. 3 weeks accumulation + 1
planned deload) that the engine consults and the coach programs, graduating
the coach from "swap an exercise" tweaks to proposing the next block from the
finished one. The plan-shape change follows the established
jsonb-with-read-site-fallbacks rule: rows without a cycle behave exactly as
today.

## Features

### 1. Block structure in plan meta
- `meta.cycle` gains `{lengthWeeks, deloadWeeks: [n], startDate}` (e.g. 4-week
  block, week 4 is the deload). Week-in-block derives from `startDate` and
  `weekStart` — no stored counter to drift.
- **No `meta.cycle` → current behavior, byte-for-byte.** Fallbacks at every
  read site, per the pattern set by `meta` and the Phase 5 migration.
- Editable in the plan editor (enable/disable, block length, deload position);
  the onboarding `plan-designer` can propose one for experienced lifters.

### 2. Cycle-aware progression
- `computeSuggestion` takes the week-in-block as an input (staying pure and
  testable): deload weeks suggest reduced targets (~85–90% of last working
  weight, existing rep ranges) and are excluded from the miss count, so a
  planned deload can never trigger the reactive one.
- Accumulation weeks keep today's rules. The reactive 10% deload survives as
  the safety net for stalls *within* a block.

### 3. Coach programs the next block
- The `coach` edge function's context gains the cycle state, and its Zod
  schema gains a `cycle_change` suggestion type (adjust block length, move the
  deload, or start the next block with adjusted targets).
- Applied client-side via `handleApplyPlanChange` like any other suggestion,
  with `inversePlanChange` capturing the revert — undo keeps working.
- The weekly recap notes where the week fell in the block so the paste-for-
  Claude fallback carries the same context (recap snapshot test updates
  intentionally, per convention).

### 4. Surfacing the cycle
- The header subtitle / insight strip shows week-in-block ("Week 3 of 4 —
  deload next week"); the consistency calendar tints deload weeks.
- The deload week itself gets a one-line explainer on the workout view so
  lighter suggestions read as the plan working, not the app breaking.

## Data / schema changes
- None server-side — the cycle lives inside the existing `plan` jsonb row.
- `coach` edge-function prompt + Zod schema extension (redeploy, no migration).

## Out of scope
- Percentage-based programming off tested 1RMs (e1RM stays an analytics
  signal, not a prescription input).
- Multi-block long-term planning (macrocycles) — the coach proposes one block
  at a time.
- Auto-enabling cycles for existing users; it's opt-in via the plan editor or
  a coach suggestion.

## Dependency
- The progression engine and its test suite (Phases 3/6, shipped); the coach
  apply/undo path (Phase 9, shipped).

## As shipped (July 2026)

Built as designed, with these concretizations and one deliberate divergence:

- `computeSuggestion` takes `{cycle, date}` rather than the bare week-in-block
  number the doc sketched: excluding *past* deload-week sessions from the miss
  count needs per-date classification, not just today's position. The cycle
  math lives in a new tested pure module, `src/cycleUtils.js` (normalize /
  weekInBlock / isDeloadDate / cycleStatus / applyCycleChange), and callers
  that pass nothing get pre-15 behavior byte-for-byte.
- The deload target anchors to the heavier of the last two sessions, not the
  last entry — otherwise the first lighter set logged in the deload week would
  compound the 90% cut on every input refill.
- The coach's `cycle_change` is `{lengthWeeks, deloadWeeks, startDate}` with
  nulls meaning "keep"; undo restores the *whole* previous cycle (including
  its absence) via `coachUtils.inverseCycleChange`'s `{cycle: …}` shape, since
  a cycle_change can create the block from nothing. The client sends its local
  date alongside the recap so the function can name real Mondays for
  `startDate` — log dates are client-local.
- The plan designer's proposal is assembled server-side (deterministically,
  like ids/plates) for `experience === "experienced"`: a 4-week block, week 4
  deload, shipped *without* `startDate`; the app stamps its own local Monday
  on accept, and until then the cycle is inert.
- The recap's block line only appears when a cycle is configured, so the
  snapshot (and every pre-15 user's paste block) stayed unchanged — the
  intentional-snapshot-update the doc predicted turned out unnecessary.

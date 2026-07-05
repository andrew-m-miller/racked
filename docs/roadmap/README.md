# Roadmap

Phase-by-phase design docs for Racked. Each phase is written **before** it's
built — the doc captures the intent, the feature breakdown, any schema change,
and what's explicitly out of scope, so the rationale behind existing behavior
survives after the code lands. Read the relevant doc before assuming something
in the app is dead weight.

Phases are numbered in intended build order. Later phases name their
dependencies on earlier ones rather than assuming a hard cutoff.

**Where to start:** phases 1–5 and the AI-coach stretch are shipped. The next
one to build is **Phase 6 (test harness)** — it's the safety net the rest lean
on, so do it first.

## Shipped

| Phase | Doc | Summary |
|-------|-----|---------|
| 1 | [In-workout quality of life](phase-1-workout-qol.md) | Rest timer, per-set progress, auto day selection, session summary. |
| 2 | [Progress & motivation](phase-2-progress-and-motivation.md) | Per-exercise sparklines, consistency calendar + streaks, bodyweight tracking, PR detection. |
| 3 | [Smarter training](phase-3-smarter-training.md) | Perceived-effort flag, exercise substitutions, plan moves to Supabase + in-app editor. |
| 4 | [Platform hardening](phase-4-platform-hardening.md) | Installable PWA + offline sync queue, magic-link auth + per-user RLS, cardio finisher logging. |
| 5 | _(in [README.md](../../README.md#phase-5--per-user-plans--ai-plan-designer))_ | Per-user plans (one `plan` row per account) + AI plan designer / onboarding. |
| — | [Stretch: AI coach](stretch-ai-coach.md) | Copy-for-Claude weekly recap (Tier 1) and the automated `coach` edge function (Tier 2). |

## Planned

| Phase | Doc | Summary | Depends on |
|-------|-----|---------|------------|
| 6 | [Test harness & safety net](phase-6-test-harness.md) | Vitest over the pure-logic core (`progression`, `syncQueue`, date/recap helpers) + CI gate. | — |
| 7 | [In-app insights & exercise detail](phase-7-insights-and-detail.md) | Weekly insight strip with stall flags, per-exercise detail view, e1RM line, data export. | 6 |
| 8 | [Component decomposition & routing](phase-8-decomposition.md) | Split `RackedTracker.jsx`, hash-based routing, shared-state boundary. | 6 |
| 9 | [Unified AI coaching](phase-9-unified-coaching.md) | Converge the paste-recap and `coach` function into one flow; scheduled weekly run + history. | Stretch, 3, 7 |
| 10 | [Health & device integration](phase-10-health-integration.md) | Apple Health / Health Connect bodyweight + workout sync, web-push notifications. | 4, 9 |

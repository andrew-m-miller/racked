# Roadmap

Phase-by-phase design docs for Racked. Each phase is written **before** it's
built — the doc captures the intent, the feature breakdown, any schema change,
and what's explicitly out of scope, so the rationale behind existing behavior
survives after the code lands. Read the relevant doc before assuming something
in the app is dead weight.

Phases are numbered in build order. Later phases name their dependencies on
earlier ones rather than assuming a hard cutoff — the doc for a shipped phase
also records where the implementation deliberately diverged from the plan
(e.g. Phase 9's server cron shipping as a client-side auto-run).

**Current state:** all eleven phases plus the AI-coach stretch are shipped.
There is no planned-but-unbuilt phase; when the next one takes shape, write
its doc here first, add it to the table, and build against it.

## Shipped

| Phase | Doc | Summary |
|-------|-----|---------|
| 1 | [In-workout quality of life](phase-1-workout-qol.md) | Rest timer, per-set progress, auto day selection, session summary. |
| 2 | [Progress & motivation](phase-2-progress-and-motivation.md) | Per-exercise sparklines, consistency calendar + streaks, bodyweight tracking, PR detection. |
| 3 | [Smarter training](phase-3-smarter-training.md) | Perceived-effort flag, exercise substitutions, plan moves to Supabase + in-app editor. |
| 4 | [Platform hardening](phase-4-platform-hardening.md) | Installable PWA + offline sync queue, magic-link auth + per-user RLS, cardio finisher logging. |
| 5 | _(no doc — see [README.md](../../README.md#phase-5--per-user-plans--ai-plan-designer))_ | Per-user plans (one `plan` row per account) + AI plan designer / onboarding. |
| — | [Stretch: AI coach](stretch-ai-coach.md) | Copy-for-Claude weekly recap (Tier 1) and the `coach` edge function (Tier 2). |
| 6 | [Test harness & safety net](phase-6-test-harness.md) | Vitest over the pure-logic core + CI gate on every PR. |
| 7 | [In-app insights & exercise detail](phase-7-insights-and-detail.md) | Weekly insight strip with stall flags, per-exercise e1RM detail view, data export. |
| 8 | [Component decomposition & routing](phase-8-decomposition.md) | Split `RackedTracker.jsx` into prop-driven components, hash router, `AppState` context. |
| 9 | [Unified AI coaching](phase-9-unified-coaching.md) | Coach-first weekly view with apply/undo, `coach_runs` cache + history, opt-in weekly auto-run. |
| 10 | [Health & device integration](phase-10-health-integration.md) | Apple Health / Health Connect bridge via Shortcuts, web push (rest timer + weekly nudge). |
| 11 | [Hardening & sharing readiness](phase-11-hardening-and-sharing.md) | Bug fixes from the July 2026 full-codebase review, invite-only sign-ups + per-user AI quotas for sharing the deployment, one-pass log date index, shared UI module, ESLint CI gate. |

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Racked is a personal workout tracker: a Vite + React SPA backed by Supabase Postgres, deployed to GitHub Pages. No test suite, no linter configured — verify changes by running the app (`npm run dev`) and exercising the flow in-browser.

## Commands

```bash
npm install       # install deps
npm run dev       # vite dev server
npm run build     # production build (outputs dist/)
npm run preview   # preview the production build
```

Local setup requires a `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (copy `.env.example`); `src/supabaseClient.js` throws if they're missing. Full table-creation SQL for a fresh Supabase project is in `README.md`.

Deploys automatically via `.github/workflows/deploy.yml` on every push to `main` (also manually dispatchable). `vite.config.js` sets `base: "/racked/"` to match the GitHub Pages project-page URL — don't remove this.

## Architecture

**Frontend:** plain inline styles (no CSS/Tailwind), `lucide-react` for icons, installable PWA (`vite-plugin-pwa`: manifest + service worker precache + Google Fonts runtime cache). No component library, no client-side router — view switching is state-driven inside `RackedTracker.jsx`.

**Auth:** `src/AuthGate.jsx` wraps the app (in `main.jsx`) and gates everything behind Supabase magic-link email sign-in, with a one-time-code fallback (`verifyOtp`) since magic-link redirects only work against an allowlisted URL, which is brittle in dev.

**Persistence — Supabase Postgres, four tables, all RLS-scoped to `auth.uid() = user_id` (except `video_links`):**
- `logs` — one row per logged set (`exercise_slug`, `date`, `weight`, `reps`, `effort`, `note`, `user_id`). `weight` doubles as seconds-held for timed core holds; `effort` is -1/0/1/null; `note` holds finisher machine/mode; finisher cardio is logged under per-day slugs (`finisher-a`, etc.) with `reps` = minutes.
- `weigh_ins` — bodyweight tracking, loads fail-soft.
- `plan` — one jsonb row per user (`data = {meta, days}`, pk is `user_id`). `meta` drives the recap program line, streak target, and header subtitle. Pre-migration `{days}`-only rows must still load — keep fallbacks at every `meta` read site. Falls back to the bundled `exercises.json` seed if the row is missing or the read fails.
- `video_links` (`slug` pk, `url`, `title`) — shared cache of found YouTube tutorial URLs. RLS on with **no policies**: only the `find-videos` edge function (service role) touches it.

**Storage layer (`src/storage.js`):** async `loadLogs`/`addLogEntry`/`clearAllLogs`/`loadWeighIns`/`addWeighIn`/`loadPlan`/`savePlan`. UI does optimistic updates with rollback + an error banner on failure. Also snapshot-caches last-successful server reads so the app cold-starts offline (server truth only; pending queued ops are layered on top at read time).

**Offline queue (`src/syncQueue.js`):** writes that fail on a *network* error (not RLS/SQL errors, which still surface red) are parked in localStorage and FIFO-replayed on the `online` event; new writes queue behind pending ones to preserve insert order, since progression logic reads "last entry". Amber "n entries pending sync" banner while queued.

**Progression engine (`src/progression.js`, `computeSuggestion`/`targetNumber`):** upper-body lifts +5 lb, lower-body +10 lb once all sets hit the top of the rep range; timed core holds +5-10s; rep-based bodyweight moves suggest +1-2 reps; missing the target 2 sessions running triggers a 10% deload. Optional per-set effort rating shifts these: brutal+hit holds the weight and counts as a half-miss toward deload, easy+hit doubles the lower-body jump.

**Edge functions (`supabase/functions/*/index.ts`, Supabase/Deno, `npm:` specifiers, JWT verification on, shared `ANTHROPIC_API_KEY` secret, model `claude-sonnet-5`):** deploy with `npx supabase functions deploy <name> --project-ref fugrbmkhuhphskitpvzc`.
- `coach` — weekly recap + plan in, `{narrative, suggestions[]}` out (Zod structured output). Suggestions can carry a one-tap `plan_change` applied client-side via `handleApplyPlanChange`.
- `plan-designer` — onboarding goals form in, full `{summary, meta, days}` plan out. Server assembles ids/labels/plates and `results?search_query=` fallback video URLs post-parse; validates day count, ≥4 exercises/day, sluggable names.
- `find-videos` — exercise names in, `{videos: {slug: {url, title}}}` out. Checks the `video_links` cache first, web-searches uncached names (`web_search_20260209`, with a `pause_turn` continuation loop), strictly validates `watch?v=` URLs, upserts the cache. Best-effort: the client always keeps its search-link fallback.

**Onboarding (`src/Onboarding.jsx`):** goals form → `plan-designer` call → review (tweak/regenerate, background `find-videos` upgrade, Skip → bundled seed). Shown to new users (no plan row + no logs) and re-entered via the plan editor's "replace" mode.

## Key files

- `src/RackedTracker.jsx` — the workout flow: day tabs, exercise cards (effort chips, swap picker, sparklines), finisher card, rest timer, session summary, PR toast, top-level state/view switching. A "complete" workout requires lift sets **and** the finisher.
- `src/planUtils.js` — shared helpers: `SEED_DAYS`, `slug`, `exMetric`, `dayForDate`, `finisherSlug`, category/plate colors.
- `src/PlanEditor.jsx` — in-app plan editor (writes to `plan`); add/remove/rename days (max 5); entry point into `Onboarding.jsx`'s "design a new plan" flow.
- `src/recap.js` — `buildWeeklyRecap({days, meta, logs, weighIns, today})`, consumed by `RecapSection.jsx`.
- `exercises.json` — plan seed (`{meta, days}`) + curated substitution `alts` per exercise. `meta.description` must stay byte-identical to the recap's original hardcoded program line so existing users' recap text doesn't change.
- `public/icon-*.png` — PWA/app icons, generated by a dependency-free Node script (raw PNG + zlib), plate-colored per day.
- `docs/roadmap/*.md` — phase-by-phase design docs for past work; check here for the rationale behind existing behavior before assuming something is dead weight.

## Working conventions

- No test suite or linter exists — after a change, actually run it (`npm run dev`) rather than relying on a type check.
- Everything reads/writes through `src/storage.js`; don't call the Supabase client directly from components.
- Any schema change needs a corresponding SQL migration documented in `README.md` (which doubles as the setup guide for a fresh Supabase project) — follow the existing pattern of ordered, copy-pasteable `alter table`/backfill blocks with a note on fail-soft behavior during rollout.
- When changing the `plan` jsonb shape, keep old rows loadable (fallbacks at read sites) rather than requiring a hard migration — this is the established pattern for `meta` and was used again for the Phase 5 per-user migration.

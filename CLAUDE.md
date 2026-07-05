# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Racked is a personal workout tracker: a Vite + React SPA backed by Supabase Postgres, deployed to GitHub Pages. Vitest covers the pure-logic core (`progression`, `syncQueue`, `planUtils`, `recap`, `insights`, `dataExport`) plus render tests (`@testing-library/react`) over the extracted view components (`ExerciseCard`, `FinisherCard`, `RestTimer`, `SessionSummary`, `PRToast`, `DayTabs`, `useHashRoute`); there are no E2E tests and no linter, so flow-level UI changes are still verified by running the app (`npm run dev`) and exercising the flow in-browser (see `.claude/skills/verify/SKILL.md` for a headless recipe).

## Commands

```bash
npm install       # install deps
npm run dev       # vite dev server
npm run build     # production build (outputs dist/)
npm run preview   # preview the production build
npm test          # vitest, single run (also the CI gate on PRs)
npm run test:watch # vitest watch mode
```

Tests live beside the code as `src/*.test.js(x)` and run in a pinned non-UTC timezone (`TZ=America/New_York`, set in the npm scripts) so UTC-drift date bugs can't pass unnoticed. The default vitest environment is node; browser-global and component tests opt into jsdom via a per-file `@vitest-environment` docblock (`syncQueue.test.js` additionally polyfills `localStorage` in-file — Node 26's stub isn't functional and vitest's jsdom env doesn't override it). Vitest globals are off, so component tests import from `vitest` explicitly and call RTL's `cleanup()` in `afterEach` themselves; never import `RackedTracker`/`AppState`/`storage`/`supabaseClient` in tests (`supabaseClient` throws without env vars). `.github/workflows/ci.yml` runs the suite on every PR and push to `main`.

Local setup requires a `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (copy `.env.example`); `src/supabaseClient.js` throws if they're missing. Full table-creation SQL for a fresh Supabase project is in `README.md`.

Deploys automatically via `.github/workflows/deploy.yml` on every push to `main` (also manually dispatchable). `vite.config.js` sets `base: "/racked/"` to match the GitHub Pages project-page URL — don't remove this.

## Architecture

**Frontend:** plain inline styles (no CSS/Tailwind), `lucide-react` for icons, installable PWA (`vite-plugin-pwa`: manifest + service worker precache + Google Fonts runtime cache). No component library and no router dependency — views are hash-routed by `src/useHashRoute.js` (`#/` workout · `#/progress` · `#/plan` editor · `#/onboard` · `#/exercise/<slug>` detail overlay), which keeps them URL-addressable and the back button working in the installed PWA without server rewrites under the `/racked/` base. `#/onboard` bounces non-blank accounts back to `#/` unless the plan editor explicitly entered "replace" mode, because new-mode Skip saves the seed over the current plan.

**Shared state:** `src/AppState.jsx` (context) owns `logs`/`weighIns`/`days`/`planMeta`, the initial load, the offline-queue wiring, and the optimistic-update-with-rollback writes; `RackedTracker.jsx` is the composition + workout-session state root (active day, rest timer, swaps, PR toast) and `ProgressView` reads data straight from the context. View components stay prop-driven.

**Auth:** `src/AuthGate.jsx` wraps the app (in `main.jsx`) and gates everything behind Supabase magic-link email sign-in, with a one-time-code fallback (`verifyOtp`) since magic-link redirects only work against an allowlisted URL, which is brittle in dev — and, on iOS, tapping the link from Mail always opens Safari rather than the installed home-screen app (no deep-link mechanism into a standalone PWA), so `AuthGate.jsx` detects standalone mode (`navigator.standalone` / `display-mode: standalone`) and defaults straight to the code flow there.

**Email delivery:** Supabase sends auth emails (magic link + OTP) through Resend, configured as a plain SMTP relay in Supabase's dashboard (Authentication → Settings → SMTP Settings) — Resend has no template of its own in this setup; Supabase renders the email from its own dashboard template (Authentication → Email Templates → Magic Link) and just hands the finished message to Resend as a transport. Both the link and the numeric code come from that single template, which must include `{{ .Token }}` in the body for the code to actually appear (the stock template only has `{{ .ConfirmationURL }}`). Template edits can take a couple of minutes to propagate — the next email out isn't necessarily on the new template.

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

- `src/RackedTracker.jsx` — composition + state root for the workout flow: wires the hash route to views, owns session state (active day, rest timer, swaps, PR toast), and computes day-completion. A "complete" workout requires lift sets **and** the finisher.
- `src/ExerciseCard.jsx` / `src/FinisherCard.jsx` / `src/RestTimer.jsx` / `src/SessionSummary.jsx` (also exports `sessionStats`) / `src/PRToast.jsx` / `src/DayTabs.jsx` — the extracted, prop-driven workout-view components, each with a render test beside it.
- `src/AppState.jsx` — the shared data context (see Architecture); `src/useHashRoute.js` — the hash router.
- `src/planUtils.js` — shared helpers: `SEED_DAYS`, `slug`, `exMetric`, `dayForDate`, `finisherSlug`, category/plate colors.
- `src/PlanEditor.jsx` — in-app plan editor (writes to `plan`); add/remove/rename days (max 5); entry point into `Onboarding.jsx`'s "design a new plan" flow.
- `src/recap.js` — `buildWeeklyRecap({days, meta, logs, weighIns, today})`, consumed by `RecapSection.jsx`.
- `exercises.json` — plan seed (`{meta, days}`) + curated substitution `alts` per exercise. `meta.description` must stay byte-identical to the recap's original hardcoded program line so existing users' recap text doesn't change.
- `public/icon-*.png` — PWA/app icons, generated by a dependency-free Node script (raw PNG + zlib), plate-colored per day.
- `docs/roadmap/*.md` — phase-by-phase design docs for past work; check here for the rationale behind existing behavior before assuming something is dead weight.

## Working conventions

- Run `npm test` after touching the pure-logic modules or the extracted view components; keep their tests current (the recap snapshot pins the paste-block format on purpose — update it only when the format change is intended). Component render tests cover the extracted pieces only — for flow-level UI changes, actually run the app (`npm run dev`) rather than relying on a type check.
- Everything reads/writes through `src/storage.js`; don't call the Supabase client directly from components.
- Any schema change needs a corresponding SQL migration documented in `README.md` (which doubles as the setup guide for a fresh Supabase project) — follow the existing pattern of ordered, copy-pasteable `alter table`/backfill blocks with a note on fail-soft behavior during rollout.
- When changing the `plan` jsonb shape, keep old rows loadable (fallbacks at read sites) rather than requiring a hard migration — this is the established pattern for `meta` and was used again for the Phase 5 per-user migration.

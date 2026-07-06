# Phase 11 — Hardening & Sharing Readiness

Fix what a full-codebase review (July 2026) turned up, and remove the
remaining single-user assumptions so the app can be shared with friends on
the same deployment. Four buckets: correctness bugs, multi-user/abuse
hardening, efficiency work that gets worse as history grows, and codebase
patterns that slow future changes. Nothing here adds user-facing features —
it pays down what Phases 1–10 accrued.

## 1. Correctness fixes

### 1.1 Deload triggers on missed *sets*, not missed *sessions*
`progression.js` scans per-set history backwards and counts every under-target
entry toward `missScore`, but every doc (CLAUDE.md, the recap's progression
line, the suggestion's own detail text "Missed target N **sessions** in a
row") says the trigger is 2 missed *sessions*. In practice a normal fatigue
pattern — hit, hit, miss on the last two sets of one session — scores 2 and
suggests a 10% deload after a single workout. The existing tests only use
one-entry-per-session histories, so they can't see the difference.
- Fix: group history by date and evaluate the miss scan per session (a
  session's verdict = its last set, matching how the hit/target check already
  works), keeping the brutal-rated half-miss rule.
- Add tests with realistic multi-set sessions; the recap snapshot shouldn't
  change for single-set fixtures.

### 1.2 Cross-account localStorage bleed on a shared browser
None of the localStorage keys are scoped to the signed-in user: the offline
queue (`racked-pending-v1`), the cold-start snapshot (`racked-snapshot-v1`),
and the flags (`racked-push-on`, `racked-coach-auto`). Sign out with ops
queued, have someone else sign in on the same browser, and `flushPending`
replays user A's sets as user B (rows insert with `user_id default
auth.uid()`); offline, user B cold-starts into user A's snapshot. Harmless
solo, a data-integrity and privacy bug the moment two accounts touch one
device.
- Fix: suffix the queue and snapshot keys with the user id (available from
  the cached session), or clear both on `onAuthStateChange` sign-out /
  user-switch. Key-per-user is safer — it also survives A signing back in
  with their queue intact.

### 1.3 `health-sync` GET misses evening workouts (UTC "today")
The export defaults `since` to `new Date().toISOString().slice(0, 10)` —
UTC — while log dates are the client's *local* day. From 8pm ET (midnight
UTC), the server's "today" is already tomorrow, so the documented "run the
Shortcut in the evening on training days" automation returns an empty
window exactly when it's meant to run.
- Fix: default the window to UTC-today−1 (returning per-date rows lets the
  Shortcut pick the right one), or accept an explicit `date` param the
  Shortcut fills with its local date, like POST already does.

### 1.4 `#/exercise/<slug>` with no history renders `-Infinity`
`ExerciseDetail.jsx` computes `Math.max(...values)` over an empty array when
a deep link targets a plan exercise that's never been logged (the sparkline
entry point requires ≥2 entries, the URL doesn't). Show the "log a couple of
sessions" empty state for the stats block too.

### 1.5 Coach apply/undo races
In `CoachSection.jsx`, only the clicked suggestion disables while an apply is
in flight; a second Apply before the re-render captures a stale
`displayRun.applied` and can drop the first suggestion's undo record.
Same-shape issue in `RackedTracker.handleLog`, which reads render-scope
`logs` for the lifts-done check. Both are fast-double-tap windows: disable
the whole suggestion group while `applying != null`, and derive the apply
update from the latest run (functional update through AppState) rather than
the render closure.

## 2. Multi-user & abuse hardening (the sharing gate)

The app is already structurally multi-user — RLS scopes every table, plans
are per-user, onboarding greets blank accounts. What's missing is control
over who gets in and what a signed-in account can spend.

### 2.1 Control signups
Supabase magic-link auth means anyone who finds the URL can mint an account
and start spending Anthropic credits. Pick one:
- **Invite-only** (recommended): dashboard → Authentication → disable public
  sign-ups; add friends via Invite User. Zero code, the sign-in screen just
  errors for strangers — add a friendlier "ask Andrew for an invite" message
  to that error path in `AuthGate.jsx`.
- Or an email allowlist enforced by a Supabase auth hook, if invites feel
  too manual.

### 2.2 Per-user quotas on the AI edge functions
`coach`, `plan-designer`, and `find-videos` verify the JWT but nothing
meters them — any account can call them in a loop. Costs are small per call
(~½¢ coach, ~1¢ + $0.15–0.35 of web search per plan) but unbounded.
- Add a server-side check at the top of each function: count that user's
  calls in a small `fn_usage` table (or reuse `coach_runs` for the coach) and
  reject past a sane cap — e.g. coach 10/week, plan-designer 10/day,
  find-videos rides along with plan-designer. Return a clear "quota" error
  the client already renders via its error paths.
- Cap request-body sizes while in there: `coach` currently accepts an
  unbounded `recap` string and plan list (input-token amplification);
  `plan-designer` already clamps `constraints`/`tweak` — extend the pattern.

### 2.3 Rate-cap the push scheduler
`push-send` `{type:"timer"}` holds an isolate open 5–300 s per call and is
callable at will by any signed-in user (the app fires it once per logged
set). Cheap but abusable; a per-user in-flight cap (e.g. reject if that user
already has N pending timers — track in a tiny table or accept
last-write-wins with a shared notification tag) closes it.

### 2.4 Shared-cache writes
`video_links` is a shared cache written by whatever exercise names a caller
sends. URLs are validated to real `watch?v=` links, so poisoning is limited
to "wrong tutorial", but with multiple users it's worth noting the cache is
first-writer-wins per slug. Acceptable as-is; revisit only if it bites.

### 2.5 Deployment config, not personal constants
- `push-send` falls back to `https://andrew-m-miller.github.io/racked/` when
  the `APP_URL` secret is unset — fine for this instance, but set the secret
  and treat the fallback as dev-only.
- README setup is a phase-by-phase migration diary with single-user
  backfills (`select id from auth.users limit 1`). Friends joining *this*
  instance don't care, but add one consolidated "fresh project" SQL block
  (all seven tables + policies, no backfills) so a fork doesn't replay ten
  phases. Keep the phase history below it.
- Nice-to-have, not a blocker: units are hardcoded to lb and `en-US`
  formatting throughout (progression increments, recap text, charts). A kg
  toggle is real work across `progression.js`/`recap.js`/UI — out of scope
  here; note it as its own future phase if a metric-country friend signs up.

## 3. Efficiency (grows with history)

### 3.1 Index logs by date once
`dayForDate` is a full plan×logs scan *per date asked about*, and the
calendar/recap/insights ask about every training date — O(dates × total
entries) and climbing. Build a `{date → entries/slugs}` index once per logs
change (memoized helper in `planUtils.js`) and let `dayForDate`, the
calendar, `buildWeeklyRecap`, and `buildWeeklyInsights` all vote from it.
Same numbers, one pass.

### 3.2 Bound the cold-start payload
`loadLogs` fetches every set ever logged on every open and mirrors it into
the localStorage snapshot (~5 MB budget shared with everything else). Fine
for years of solo data; before it isn't, window the initial fetch (e.g. last
12 months, with the exercise detail view lazy-loading older history) and trim
the snapshot the same way. Low urgency — measure first, the review found no
current pain.

## 4. Patterns that slow future work

### 4.1 A tiny shared UI module
The inline-style system has started duplicating whole components:
`StatBlock` (ProgressView + ExerciseDetail), section headers (ProgressView +
HealthSection), the copy-to-clipboard button with its `execCommand` fallback
(CoachSection + HealthSection), ghost-button styles, the Google Fonts
`@import` (RackedTracker + AuthGate), and font-family string literals in
every file. Extract `src/ui.jsx`: color/font constants, `StatBlock`,
`SectionTitle`, `CopyButton`, `ghostBtn`. No visual change — every restyle
currently touches a dozen files, and that's the tax this removes.

### 4.2 Turn the lint comments back on
The codebase carries `eslint-disable-next-line react-hooks/exhaustive-deps`
comments but has no ESLint config or dependency — the rules those comments
silence never run. Add flat-config ESLint with `react-hooks` +
`react-refresh`, wire `npm run lint` into `ci.yml` beside the tests, and fix
or explicitly justify what it flags. The hooks rules are the ones that catch
real bugs in this codebase (stale closures like §1.5).

### 4.3 Deduplicate the error heuristics
The `/not found|404|Failed to send/` → "backend isn't deployed" mapping
lives in both `CoachSection.jsx` and `Onboarding.jsx`; move it next to the
invoke wrappers (`coach.js` / a sibling) so a Supabase error-shape change is
a one-file fix.

### 4.4 Test the seams the review leaned on
The pure-logic core is well covered; the load-bearing untested seams are
`storage.js` (snapshot merge + pending-op layering), `handleApplyPlanChange`
(match/reject + meta preservation), and the CoachSection apply/undo
round-trip against `inversePlanChange`. Each has pure-ish logic worth
extracting or exercising with the existing jsdom setup. Also fix the stale
manifest copy while touching config: `vite.config.js` still describes the
app as a "3-day full body workout tracker".

## Data / schema changes
- `fn_usage` (or equivalent) table for §2.2/§2.3 quotas: `(user_id, fn,
  day, count)` with RLS deny-all (service role only), documented in README
  per the migration pattern.
- No changes to existing tables. localStorage key scoping (§1.2) is
  client-only.

## Out of scope
- kg/metric support (§2.5) — its own phase if needed.
- Log windowing beyond measurement (§3.2) unless cold-start time actually
  degrades.
- Social features (shared plans, leaderboards, following) — sharing here
  means "friends run their own accounts on this deployment", nothing more.
- Migrating off GitHub Pages or adding a server beyond the existing edge
  functions.

## Implementation notes (shipped July 2026)

Where the build deliberately diverged from the plan above:

- **§1.3 health-sync**: shipped *both* options — the default window is the
  last two UTC days (the Shortcut takes the latest `workouts` item) *and*
  `?date=` exports one exact day. The two-day default keeps existing
  Shortcuts working without edits.
- **§1.5 `handleLog`**: assessed and left alone. React flushes state between
  browser events, so two taps can't observe the same stale `logs` — the
  CoachSection group-disable was the only reachable window, and it shipped.
- **§2.2/§2.3 quotas**: shipped as per-UTC-day caps for everything (coach
  10, plan-designer 10, find-videos 20 search batches, rest-timer pushes
  200) rather than the sketched coach-weekly / push-in-flight variants — one
  `bump_fn_usage` RPC covers all four, and the push cap bounds the same
  abuse with far less machinery. find-videos checks the cap lazily so
  fully-cached calls stay free. Quota refusals return **200 + `{error}`**
  because supabase-js buries non-2xx response bodies and every client
  already surfaces `data.error`.
- **§3.2 / storage seams**: not measured/extracted this phase; `storage.js`
  stays untestable-by-convention (imports `supabaseClient`). The seams that
  did get tests: `applyPlanChange` (extracted to `planUtils`, including the
  `inversePlanChange` round-trip), `buildDayIndex`, `storageScope`, and
  render tests for `ExerciseDetail` (the `-Infinity` regression) and `ui`.
- **§4.2 ESLint**: the react-hooks plugin's newer compiler-alignment rules
  (`purity`, `refs`, `set-state-in-effect`) are deliberately **off** — they
  flag idioms this codebase uses on purpose (event-driven `Date.now()`
  reads, `useState(Date.now())` in RestTimer, the init-day effect). The
  classic `rules-of-hooks` + `exhaustive-deps` run as errors under a
  zero-warnings policy; revisit the compiler rules only with the React
  Compiler itself.
- **§2.1**: the in-app half (the invite-only sign-in message) shipped; the
  dashboard half (disable public sign-ups, invite users) is an operator
  step, documented in README Phase 11.

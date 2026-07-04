# Racked

A personal workout tracker with weight/rep progression suggestions and an AI
plan designer.

## Setup

### 1. Supabase — create the table

In your Supabase project, open the **SQL Editor** and run:

```sql
create table logs (
  id             bigint generated always as identity primary key,
  exercise_slug  text not null,
  date           date not null,
  weight         numeric,
  reps           numeric,
  created_at     timestamptz default now()
);

-- Allow public read/write (personal app, no auth)
alter table logs enable row level security;
create policy "Allow all" on logs for all using (true) with check (true);
```

`weight` holds pounds for lifts, or seconds held for timed core holds (Plank, Side
Plank). `reps` holds the rep count. Both are nullable since bodyweight rep exercises
don't log a weight/seconds value.

For bodyweight tracking (the Progress screen), also run:

```sql
create table weigh_ins (
  id         bigint generated always as identity primary key,
  date       date not null,
  weight_lb  numeric not null,
  created_at timestamptz default now()
);

alter table weigh_ins enable row level security;
create policy "Allow all" on weigh_ins for all using (true) with check (true);
```

The app works without this table — weigh-in loading fails soft — but logging a
weigh-in will show the save-error banner until it exists.

For effort ratings and the in-app plan editor (Phase 3), also run:

```sql
-- optional easy/right/brutal rating per set: -1 / 0 / 1, null when skipped
alter table logs add column effort smallint;

-- the editable plan lives in a single jsonb row; exercises.json is the seed
create table plan (
  id         smallint primary key default 1,
  data       jsonb not null,
  updated_at timestamptz default now()
);

alter table plan enable row level security;
create policy "Allow all" on plan for all using (true) with check (true);
```

Both fail soft too: without the `effort` column logging errors, and without the
`plan` table the app just uses the plan bundled in `exercises.json`.

### Phase 4 — auth + finisher logging

Phase 4 replaces the open "Allow all" policies with real per-user security and
adds a `note` column for finisher machine/mode. **Order matters** — the backfill
needs your user account to exist first:

1. In Supabase → **Authentication → URL Configuration**, set the Site URL to
   `https://andrew-m-miller.github.io/racked/` and add your dev URLs (e.g.
   `http://localhost:5173/racked/`, `http://192.168.1.67:5173/racked/`) as
   additional redirect URLs. Email (magic link) auth is enabled by default.
2. Open the app and sign in once with your email — this creates your
   `auth.users` row. The old open policies are still active, so everything works.
3. Then run:

```sql
-- finisher machine/mode ("treadmill", "rower", ...)
alter table logs add column note text;

-- per-user ownership; new rows pick up the signed-in user automatically
alter table logs add column user_id uuid default auth.uid();
alter table weigh_ins add column user_id uuid default auth.uid();

-- claim all existing rows for the (single) account
update logs set user_id = (select id from auth.users limit 1) where user_id is null;
update weigh_ins set user_id = (select id from auth.users limit 1) where user_id is null;

-- lock down: replace the open policies with per-user / signed-in-only ones
drop policy "Allow all" on logs;
drop policy "Allow all" on weigh_ins;
drop policy "Allow all" on plan;
create policy "Own rows" on logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own rows" on weigh_ins for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Signed in" on plan for all to authenticated
  using (true) with check (true);
```

After this, the anon key in the public bundle is harmless on its own — every
read and write requires a signed-in session, and log/weigh-in rows are scoped
to their owner.

### AI coach (stretch) — one-time Edge Function setup

The weekly recap (Progress → Weekly recap) works with zero setup: **Copy for
Claude** pastes into the Claude app. The in-app **Get coach review** button
needs the `coach` Edge Function deployed once, so your Anthropic API key stays
server-side:

**Dashboard path (no tooling):** Supabase → Edge Functions → Deploy a new
function → name it `coach`, paste `supabase/functions/coach/index.ts`, deploy.
Then Edge Functions → Secrets → add `ANTHROPIC_API_KEY` (create a key at
console.anthropic.com). Leave "Verify JWT" on — only signed-in app users can
call it.

**CLI path:**

```bash
npx supabase login
npx supabase link --project-ref fugrbmkhuhphskitpvzc
npx supabase functions deploy coach
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Cost: one review sends a few KB and returns ~1K tokens — around half a cent
per week at Claude Sonnet 5 pricing ($3/$15 per MTok).

### Phase 5 — per-user plans + AI plan designer

Phase 5 makes the plan per-user (one `plan` row per account instead of a single
shared row) and adds the AI plan-designer onboarding: new users answer a short
goals form, Claude designs a 2–5-day plan, and a background search upgrades the
plan's YouTube search links to real tutorial videos, cached in `video_links`.

Run in the SQL Editor (the backfill claims the existing row for the oldest
account, so your `auth.users` row must exist — same ordering caveat as Phase 4):

```sql
alter table plan add column user_id uuid default auth.uid();
update plan set user_id = (select id from auth.users order by created_at limit 1)
  where user_id is null;
alter table plan alter column user_id set not null;
alter table plan drop constraint plan_pkey;
alter table plan drop column id;
alter table plan add primary key (user_id);
drop policy "Signed in" on plan;
create policy "Own rows" on plan for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Shared cache of found tutorial videos, keyed by exercise slug.
-- RLS on with no policies: only the find-videos edge function
-- (service role) reads/writes it.
create table video_links (
  slug text primary key,
  url text not null,
  title text,
  created_at timestamptz default now()
);
alter table video_links enable row level security;
```

Run the SQL and push the new client together: in the gap the old client fails
soft (the plan read falls back to the bundled seed, saves show the error
banner), so nothing breaks — it's just briefly read-only for plans.

Then deploy the two new Edge Functions (same paths as the coach — dashboard
paste or CLI):

```bash
npx supabase functions deploy plan-designer
npx supabase functions deploy find-videos
```

The `ANTHROPIC_API_KEY` secret is shared with `coach` — no new secret needed.
`find-videos` also uses the auto-injected `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` to read and write the `video_links` cache.

Cost: one plan generation is a few thousand tokens (~a cent); the background
video search runs ~15–35 web searches per new plan (≈$0.15–0.35 at $10/1k
searches), and the cache makes repeat exercises free.

### 2. Environment variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Find your credentials in Supabase → **Settings → API**:
- `VITE_SUPABASE_URL` — your Project URL
- `VITE_SUPABASE_ANON_KEY` — your anon/public key

**Never commit `.env` to git.** It's already in `.gitignore`.

### 3. Install and run locally

```bash
npm install
npm run dev
```

### 4. Deploy to GitHub Pages

The repo is already wired up: `.github/workflows/deploy.yml` builds and deploys to
GitHub Pages on every push to `main`, using the `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` repository secrets (**Settings → Secrets and variables →
Actions**) as the build-time env vars.

Live at `https://andrew-m-miller.github.io/racked/`.

## Features

- 2–5-day workout plan — AI-designed at onboarding (goals form → Claude builds
  the split, sets/reps, starting weights, and tutorial links) or the bundled
  3-day full-body default, 5–7 exercises + cardio finisher each day
- Weight/rep inputs pre-filled with the recommended next set, still fully editable
- Progression suggestions: +5 lb (upper) / +10 lb (lower) once you hit the top of
  the rep range, +5-10 sec on core holds, automatic 10% deload after 2 missed
  sessions in a row
- Exercise cards link out to a form-tutorial video
- 90s rest timer after every set, per-set progress, and a workout-complete summary
- Progress screen: bodyweight trend (7-day smoothed), streak counters, and a
  plate-colored consistency calendar
- Tappable sparkline on each card opens a full progress chart with the all-time PR
- PR toast when a set beats your all-time best
- Optional easy/right/brutal effort rating per set that tunes the progression
  (hold after a brutal session, bigger jumps after easy lower-body work, and
  grinding counts toward the deload trigger)
- Swap button per exercise with curated alternates for when a machine's taken —
  each substitute keeps its own history and progression
- In-app plan editor: change exercises, sets, reps, starting weights, order, and
  finishers from your phone; the plan lives in Supabase, no deploy needed
- Installable PWA: add to your phone home screen, opens full-screen, app shell
  and fonts cached for offline
- Offline sync queue: sets logged in a gym dead-zone are queued on-device and
  upload automatically when the connection returns ("n entries pending sync")
- Magic-link email sign-in with per-user row-level security — no password, and
  the database is no longer world-writable
- Finisher logging: minutes + optional machine/mode, counted in the session
  summary and consistency calendar — a complete workout means lifts *and* cardio
- Weekly recap: the week's sessions, volume, bodyweight trend, and per-lift
  detail as a paste-ready block for a coaching chat in the Claude app
- In-app AI coach: the recap goes to Claude Opus 4.8 via a Supabase Edge
  Function (API key stays server-side); advice renders in-app with one-tap
  "Apply to plan" tweaks wired into the plan editor's storage
- Data persisted in Supabase Postgres, so your log follows you across devices

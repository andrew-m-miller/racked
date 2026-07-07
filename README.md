# Racked

A personal workout tracker with weight/rep progression suggestions and an AI
plan designer.

## Setup

### Fresh Supabase project — one-shot schema

Setting up a brand-new instance? Run this single block in the SQL Editor and
skip the numbered/phase sections below — those are the original deployment's
migration history (kept because they document the fail-soft rollout behavior
of each change), and they assume you're upgrading in order with existing data.

```sql
-- One row per logged set. `weight` doubles as seconds-held for timed core
-- holds; `effort` is -1/0/1/null; `note` holds the finisher machine/mode.
create table logs (
  id             bigint generated always as identity primary key,
  exercise_slug  text not null,
  date           date not null,
  weight         numeric,
  reps           numeric,
  effort         smallint,
  note           text,
  user_id        uuid default auth.uid(),
  created_at     timestamptz default now()
);
alter table logs enable row level security;
create policy "Own rows" on logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bodyweight tracking.
create table weigh_ins (
  id         bigint generated always as identity primary key,
  date       date not null,
  weight_lb  numeric not null,
  user_id    uuid default auth.uid(),
  created_at timestamptz default now()
);
alter table weigh_ins enable row level security;
create policy "Own rows" on weigh_ins for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One editable plan per user ({meta, days} jsonb); exercises.json is the seed.
create table plan (
  user_id    uuid primary key default auth.uid(),
  data       jsonb not null,
  updated_at timestamptz default now()
);
alter table plan enable row level security;
create policy "Own rows" on plan for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Shared cache of found tutorial videos. RLS on with no policies:
-- only the find-videos edge function (service role) touches it.
create table video_links (
  slug       text primary key,
  url        text not null,
  title      text,
  created_at timestamptz default now()
);
alter table video_links enable row level security;

-- One cached coach review per (user, week); `applied` maps suggestion
-- index -> {inverse} so one-tap Apply has a matching Undo across reloads.
create table coach_runs (
  user_id    uuid not null default auth.uid(),
  week_start date not null,
  review     jsonb not null,
  applied    jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, week_start)
);
alter table coach_runs enable row level security;
create policy "Own rows" on coach_runs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Per-user token for the Apple Shortcuts health bridge.
create table sync_tokens (
  user_id    uuid primary key default auth.uid(),
  token      text not null unique,
  created_at timestamptz default now()
);
alter table sync_tokens enable row level security;
create policy "Own rows" on sync_tokens for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One row per device/browser push subscription.
create table push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid(),
  keys       jsonb not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
create policy "Own rows" on push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Per-user daily call counters for the AI/push edge functions (Phase 11).
-- RLS with no policies + revoked RPC: only the service role touches these.
create table fn_usage (
  user_id uuid not null,
  fn      text not null,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 1,
  primary key (user_id, fn, day)
);
alter table fn_usage enable row level security;

create or replace function bump_fn_usage(p_user uuid, p_fn text, p_cap int)
returns boolean
language sql
as $$
  insert into fn_usage (user_id, fn, count)
  values (p_user, p_fn, 1)
  on conflict (user_id, fn, day)
  do update set count = fn_usage.count + 1
  returning count <= p_cap;
$$;
revoke execute on function bump_fn_usage(uuid, text, int) from public, anon, authenticated;
grant execute on function bump_fn_usage(uuid, text, int) to service_role;

-- Buddy pairing (Phase 14): one pending invite code per user, and one
-- accountability link per pair. Links are created only by the buddy-status
-- edge function (service role) at redeem time; either member can read or
-- delete (= unlink) their own link, and nothing else — buddy stats reach
-- the client only through the edge function, never via RLS.
create table buddy_codes (
  user_id    uuid primary key default auth.uid(),
  code       text not null unique,
  created_at timestamptz default now()
);
alter table buddy_codes enable row level security;
create policy "Own rows" on buddy_codes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table buddy_links (
  user_a     uuid not null,
  user_b     uuid not null,
  created_at timestamptz default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create unique index buddy_links_one_per_user_a on buddy_links (user_a);
create unique index buddy_links_one_per_user_b on buddy_links (user_b);
alter table buddy_links enable row level security;
create policy "Own links" on buddy_links for select to authenticated
  using (auth.uid() in (user_a, user_b));
create policy "Own links delete" on buddy_links for delete to authenticated
  using (auth.uid() in (user_a, user_b));
```

Then: configure auth URLs (Phase 4 step 1 below), deploy the edge functions
(AI coach + Phase 5 + Phase 10 + Phase 14 sections), and set the secrets each
section names. For a shared instance, also see "Phase 11 — sharing hardening"
for invite-only sign-ups.

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

The raw weekly recap (Progress → Weekly coach → Raw recap) works with zero
setup: **Copy for Claude** pastes into the Claude app. The in-app **Get coach
review** flow needs the `coach` Edge Function deployed once, so your Anthropic
API key stays server-side:

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

### Phase 9 — unified coaching (coach-run cache + history)

Phase 9 makes the in-app coach the primary weekly view and caches each week's
review, so opening the app shows the last run instantly instead of waiting on
a cold call — and past weeks stay readable as history, including which
suggestions were applied. Run in the SQL Editor:

```sql
-- One cached coach review per (user, week). `review` is the edge function's
-- {narrative, suggestions[]}; `applied` maps suggestion index -> {inverse}
-- so one-tap Apply has a matching one-tap Undo across reloads.
create table coach_runs (
  user_id    uuid not null default auth.uid(),
  week_start date not null,
  review     jsonb not null,
  applied    jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, week_start)
);

alter table coach_runs enable row level security;
create policy "Own rows" on coach_runs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Fails soft: without the table the coach still works, the review just isn't
remembered between sessions (no cache, no history, and the weekly auto-run
stays off so it can't spend an API call on every open).

The optional **auto-run** toggle (Progress → Weekly coach) reviews the week
that just finished on your first open of a new week — the client-side
equivalent of the roadmap's Sunday-night cron, with no extra infrastructure.
It's per-device (localStorage) and off by default.

### Phase 10 — health & device integration

Phase 10 connects the installed PWA to the phone: an Apple Health / Health
Connect bridge (weigh-ins in, workouts out, via an Apple Shortcut — web apps
have no HealthKit API) and web push notifications (a rest-timer ping when the
phone is locked, plus a weekly check-in nudge). Everything is opt-in and fails
soft: without the tables and secrets below, the new Progress sections just
show setup hints.

**1. Tables** — run in the SQL Editor:

```sql
-- Per-user token that authenticates the Shortcuts health bridge; minted
-- in-app (Progress → Health sync), resolved back to a user by the
-- health-sync edge function via the service role.
create table sync_tokens (
  user_id    uuid primary key default auth.uid(),
  token      text not null unique,
  created_at timestamptz default now()
);
alter table sync_tokens enable row level security;
create policy "Own rows" on sync_tokens for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One row per device/browser push subscription (the endpoint URL is
-- globally unique). push-send prunes rows whose endpoint the push service
-- reports gone (410).
create table push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid(),
  keys       jsonb not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
create policy "Own rows" on push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Without `sync_tokens`, the Health sync setup button shows an error pointing
here; without `push_subscriptions`, enabling notifications does the same.
Nothing else is affected.

**2. VAPID keys** (the identity push services require):

```bash
node scripts/generate-vapid-keys.mjs
```

- Put the printed `VITE_VAPID_PUBLIC_KEY=...` line in `.env`, and add the same
  value as a GitHub Actions repository secret so the deploy build gets it
  (the Notifications section shows "not configured" without it).
- Set the printed `VAPID_KEYS` JSON as an edge-function secret:
  `npx supabase secrets set VAPID_KEYS='{"publicKey":...}'` — optionally also
  `VAPID_CONTACT=mailto:you@example.com`.

Both halves come from one keypair: regenerate them together, which
invalidates existing subscriptions (users just re-enable).

**3. Edge functions:**

```bash
npx supabase functions deploy push-send --project-ref fugrbmkhuhphskitpvzc
npx supabase functions deploy health-sync --no-verify-jwt --project-ref fugrbmkhuhphskitpvzc
```

`--no-verify-jwt` on `health-sync` is deliberate: Apple Shortcuts can't hold a
Supabase session, so that function authenticates with the per-user sync token
instead (every request without a valid token gets a 401, and all reads/writes
are filtered to the token's owner). `push-send` keeps JWT verification on.

**4. Weekly nudge cron (optional):** the Sunday-evening "check-in is ready"
push. Enable the `pg_cron` and `pg_net` extensions (Dashboard → Database →
Extensions), put the service role key in Vault, and schedule:

```sql
select vault.create_secret('<service-role-key>', 'service_role_key');

select cron.schedule(
  'racked-weekly-nudge',
  '0 22 * * 0',  -- Sunday 22:00 UTC ≈ Sunday evening US
  $$
  select net.http_post(
    url     := 'https://fugrbmkhuhphskitpvzc.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{"type":"weekly"}'::jsonb
  );
  $$
);
```

`push-send` only honors `{"type":"weekly"}` from the service role, so the
broadcast can't be triggered from the client bundle.

**Using it** (both live under Progress):
- **Notifications** — enable from the installed app (iOS only allows push for
  home-screen PWAs; the section says so when you're in a Safari tab). After
  that, a rest timer finishing while the phone is locked pings you, and the
  cron nudges you when a new week's check-in is waiting. The service worker
  drops pushes while the app is on screen, so nothing double-fires.
- **Health sync** — "Set up health sync" mints a private tokened URL; the
  collapsible "Shortcut setup" panel walks through the two Shortcuts:
  POST your latest Health weigh-in in (re-sends of the same date+weight are
  ignored, so automations are safe to re-run), and GET today's finished
  session out for a Log Workout action (`?since=` widens the window for a
  backfill). Revoking mints nothing new — the old URL just stops working.

### Phase 11 — sharing hardening (quotas + invite-only)

Phase 11 readies the deployment for more than one person: per-user daily
caps on the functions that spend money, and invite-only sign-ups. Everything
fails soft — without the table below the caps just don't enforce (the
functions log the failed check and allow the call).

**1. Quota table + counter RPC** — run in the SQL Editor:

```sql
-- Per-user daily call counters for the AI/push edge functions.
-- RLS with no policies + revoked RPC: only the service role touches these.
create table fn_usage (
  user_id uuid not null,
  fn      text not null,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 1,
  primary key (user_id, fn, day)
);
alter table fn_usage enable row level security;

create or replace function bump_fn_usage(p_user uuid, p_fn text, p_cap int)
returns boolean
language sql
as $$
  insert into fn_usage (user_id, fn, count)
  values (p_user, p_fn, 1)
  on conflict (user_id, fn, day)
  do update set count = fn_usage.count + 1
  returning count <= p_cap;
$$;
-- Callers could otherwise burn other users' quotas through PostgREST.
revoke execute on function bump_fn_usage(uuid, text, int) from public, anon, authenticated;
grant execute on function bump_fn_usage(uuid, text, int) to service_role;
```

**2. Redeploy the edge functions** (they now share
`supabase/functions/_shared/quota.ts`, which the CLI bundles automatically —
dashboard-paste deploys need that file added alongside `index.ts`):

```bash
npx supabase functions deploy coach plan-designer find-videos push-send --project-ref fugrbmkhuhphskitpvzc
npx supabase functions deploy health-sync --no-verify-jwt --project-ref fugrbmkhuhphskitpvzc
```

Daily caps per user (UTC days): coach 10, plan-designer 10, find-videos 20
web-search batches (cache hits stay free), rest-timer pushes 200. Over-cap
calls return a clear message the app surfaces; adjust the numbers in each
function if they ever pinch.

**3. Invite-only sign-ups** — Supabase Dashboard → Authentication → Sign In /
Providers → turn off **Allow new users to sign up**, then add people via
Authentication → Users → **Invite user**. Existing accounts keep signing in
with magic links / codes as before; strangers get an "invite-only" message
in the app's sign-in screen.

**4. `APP_URL` secret** (optional but recommended): `push-send` falls back to
this repo's GitHub Pages URL for notification clicks — set it explicitly on a
fork: `npx supabase secrets set APP_URL=https://<you>.github.io/racked/`.

Also in Phase 11 (no setup needed): the health-sync export window now covers
the last two UTC days (plus `?date=` for an exact day) so evening Shortcut
automations can't miss a US-timezone workout, and the app's offline
queue/snapshot in localStorage is scoped per account, so two people sharing
one browser can't bleed data into each other.

### Phase 12 — set history editing (no migration needed)

Phase 12 adds edit/delete for individual logged sets (from the exercise
detail view) and backfilling past workouts (date picker on the workout view).
**No SQL to run**: the `"Own rows"` policy on `logs` was created `for all`
back in Phase 4, so per-user `update`/`delete` were already permitted — the
gap was purely client-side (the app never issued them, and didn't read back
row `id`s to target). If a fork ever tightened that policy to
select/insert-only, restore parity with:

```sql
-- Only needed if your logs policy isn't "for all" (the stock setup is).
create policy "Own rows update" on logs for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own rows delete" on logs for delete to authenticated
  using (auth.uid() = user_id);
```

Fail-soft during rollout: a missing/denied policy just surfaces the app's
existing red error banner and the optimistic edit rolls back — nothing wedges.

### Phase 14 — buddy system

Phase 14 pairs exactly two accounts for accountability: mint an invite code,
your buddy redeems it, and each of you gets a Progress-screen card with the
other's *presence* — current streak, sessions this week vs target, whether
today's workout happened — never weights, reps, or any set-level data. The
`buddy-status` edge function is the only data path, so the sharing contract
is enforced in one place. Sign-ups are invite-only (Phase 11), so a buddy
must already be an invited user — codes can't leak to strangers.

**1. Tables** — run in the SQL Editor:

```sql
-- One pending invite code per user (the sync_tokens pattern): minted and
-- revoked in-app (Progress → Buddy), resolved to its owner by the
-- buddy-status edge function at redeem time, then consumed.
create table buddy_codes (
  user_id    uuid primary key default auth.uid(),
  code       text not null unique,
  created_at timestamptz default now()
);
alter table buddy_codes enable row level security;
create policy "Own rows" on buddy_codes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One accountability link per pair, stored with user_a < user_b. No insert
-- policy on purpose: rows are created only by the buddy-status function
-- (service role) when a code is redeemed. Either member can select the row
-- and delete it (deleting IS the unlink); the per-column unique indexes
-- enforce one buddy per user even under a redeem race.
create table buddy_links (
  user_a     uuid not null,
  user_b     uuid not null,
  created_at timestamptz default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create unique index buddy_links_one_per_user_a on buddy_links (user_a);
create unique index buddy_links_one_per_user_b on buddy_links (user_b);
alter table buddy_links enable row level security;
create policy "Own links" on buddy_links for select to authenticated
  using (auth.uid() in (user_a, user_b));
create policy "Own links delete" on buddy_links for delete to authenticated
  using (auth.uid() in (user_a, user_b));
```

**2. Edge functions** — deploy the new one, redeploy `push-send` (it gained
the buddy-finished message type and the weekly combo-streak line):

```bash
npx supabase functions deploy buddy-status push-send --project-ref fugrbmkhuhphskitpvzc
```

No new secrets: `buddy-status` needs nothing beyond the built-ins, and the
buddy pushes reuse Phase 10's VAPID setup. No Anthropic calls anywhere in
this phase, but `buddy-status` still takes a `fn_usage` cap for abuse
symmetry (300 status calls and 20 buddy pushes per user per UTC day).

**Using it** (Progress → Buddy):
- **Pair up** — one of you taps "Create invite code" and sends the 8-char
  code over any channel; the other types it into "Buddy's code" and links.
  Redeeming is consent — there's no request/accept dance — and it consumes
  the code. Unlink (either side) from the card; pairing again just takes a
  fresh code.
- **Buddy card** — streak, week-vs-target, and a "Finished Push day ✓" /
  "Training today" / "Not trained yet today" line, computed fresh per visit.
- **Nudges** — if your buddy has notifications on (Phase 10), completing a
  session pings them ("Andrew just finished Legs day"); and when both of you
  hit your weekly targets, the Sunday check-in push (the existing cron — no
  new schedule) carries the combo streak: "3 weeks straight — both of you
  hit target."

Fail-soft: without the tables the Buddy section still renders and minting a
code points here; without the `buddy-status` deploy the section shows the
setup UI and redeeming reports the backend is missing. Nothing else is
affected.

### Phase 15 — mesocycle programming (no migration needed)

Phase 15 adds planned training blocks: `meta.cycle = {lengthWeeks,
deloadWeeks: [n], startDate}` inside the existing `plan` jsonb row. Weeks
listed in `deloadWeeks` suggest ~90% of the working weight at the same rep
ranges, are excluded from the reactive-deload miss count, tint the
consistency calendar, and get a one-line explainer on the workout view.
Week-in-block always derives from `startDate` + the Monday week key — there
is no stored counter to migrate or drift.

**No SQL to run** — the cycle lives in plan jsonb, and every read site treats
a missing/invalid `meta.cycle` as "no block structure", so pre-15 rows behave
exactly as before. Enable it per-user in the plan editor ("Train in blocks"),
via a coach suggestion, or let the plan designer propose one for experienced
lifters.

Redeploy two Edge Functions to pick up the coach/designer sides:

```bash
npx supabase functions deploy coach --project-ref <your-project-ref>
npx supabase functions deploy plan-designer --project-ref <your-project-ref>
```

`coach` gains a `cycle_change` suggestion type (adjust block length, move the
deload, start the next block) applied client-side with the same one-tap
apply/undo as plan tweaks; `plan-designer` proposes a 4-week block (week 4
deload) for experienced lifters. Fail-soft both ways: an old `coach`
deployment simply never returns cycle suggestions, and a new one ignores
callers that don't send cycle state.

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
- Mesocycle blocks (opt-in): repeating N-week cycles with planned deload weeks —
  ~90% suggestions on the deload, week-in-block in the insight strip, tinted
  calendar weeks, and the coach can program the next block
- Exercise cards link out to a form-tutorial video
- 90s rest timer after every set, per-set progress, and a workout-complete summary
- Progress screen: bodyweight trend (7-day smoothed), streak counters, and a
  plate-colored consistency calendar
- Tappable sparkline on each card opens a full progress chart with the all-time PR
- Fix history from the detail view: edit a mis-typed set's weight/reps/effort or
  delete it outright, and backfill a forgotten workout under its real date
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
- Weekly coach: the week's sessions, volume, bodyweight trend, and per-lift
  detail go to Claude via a Supabase Edge Function (API key stays server-side);
  the narrative + suggestions render in-app with one-tap "Apply to plan" and
  Undo, each week's review is cached (instant on next open) and kept as
  browsable history, and an optional auto-run reviews the finished week on the
  first open of a new one
- Raw recap fallback: the same weekly summary as a paste-ready block for a
  coaching chat in the Claude app — works with zero backend setup
- Web push notifications (opt-in): a ping when the rest timer ends while the
  phone is locked or the app is backgrounded, and a weekly nudge when a new
  check-in is ready — suppressed whenever the app is already on screen
- Apple Health / Health Connect bridge (opt-in): a private tokened URL that a
  Shortcut automation POSTs weigh-ins to and GETs finished workouts from, so
  bodyweight flows in without typing and training shows up in your rings
- Data persisted in Supabase Postgres, so your log follows you across devices

# Racked

A personal 3-day full-body workout tracker with weight/rep progression suggestions.

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

- 3-day alternating full-body plan (Day 1/2/3), 6 exercises + cardio finisher each
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
- Data persisted in Supabase Postgres, so your log follows you across devices

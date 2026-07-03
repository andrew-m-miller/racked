# Stretch — AI Coach Check-In

A weekly training review that turns raw logs into coaching: what went well, what
stalled, and what to change next week.

## Two tiers, built in order

### Tier 1 — Copy-for-Claude weekly summary (no API, ships fast)
- A "Weekly recap" view that assembles the week's data into a compact,
  paste-ready text block: sessions completed vs planned, total volume, per-lift
  progression (including stalls/deloads), bodyweight trend (once Phase 2 lands).
- One tap copies it to the clipboard, formatted so it can be pasted straight
  into the Claude mobile app for a conversational review.
- Zero backend changes, zero keys to manage — and it validates what a useful
  weekly summary even looks like before automating it.

### Tier 2 — Automated coach via the Claude API
- A "Coach" button that sends the Tier 1 summary to the Claude API
  (`claude-opus-4-8`, adaptive thinking) with a system prompt describing the
  program's progression rules, and renders the advice in-app.
- Structured output: a short narrative plus concrete plan tweaks (e.g. "hold
  Goblet Squat at current weight one more session", "add a set to Lat Pulldown"),
  which the Phase 3 plan editor can apply with one tap.
- Cost is negligible at this scale: a weekly call sends a few KB of logs
  (~1–2K tokens in, ~1K out), on the order of a cent per week at Opus pricing
  ($5 / $25 per MTok).
- **Key handling:** the app is a static GitHub Pages site, so the Anthropic key
  cannot ship in the bundle. Route the call through a Supabase Edge Function
  that holds the key server-side; the app calls the function, not Anthropic
  directly. (This also becomes the natural home for a scheduled weekly run
  later, via Supabase cron.)

## Dependencies
- Tier 1: none — works against today's `logs` table (richer once Phase 2's
  bodyweight data exists).
- Tier 2: Supabase Edge Function (key custody), and ideally Phase 3's plan
  editor so accepted suggestions can be applied rather than just read.

## Out of scope
- Real-time form feedback, chat UI inside the app, multi-week periodization.

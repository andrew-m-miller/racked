# Phase 14 — Buddy System

Accountability, not social. What changes behavior is someone noticing whether
you *showed up*, so a buddy sees presence — consistency, streak, "finished Push
day ✓" — never your numbers. Exactly two users per link, mutual consent,
summary-level data served through an edge function so the sharing contract is
enforced in one place. Phase 11 (invite-only sign-ups, per-user quotas) made
the deployment shareable; this is the first feature that uses it.

## Features

### 1. Pairing via invite code
- Mirrors the `sync_tokens` pattern: you mint a buddy code, your friend
  redeems it, and that creates one `buddy_links` row. No request/accept state
  machine — redeeming *is* consent, and either side can unlink (delete the
  row) at any time.
- Constraint worth stating: sign-ups are invite-only (Phase 11), so a buddy
  must already be an invited user. For an app shared with friends this is a
  feature — codes can't leak to strangers.

### 2. Buddy card on the Progress screen
- Shows the buddy's current streak, days-trained-this-week vs target, and
  whether today's workout is done — the same derivations `recap.js` and the
  consistency calendar already compute, just for the linked user.
- Served by a new `buddy-status` edge function (JWT on, service role inside):
  it resolves the caller's link and returns derived stats only. No new RLS on
  `logs`, no client-side cross-user reads — even a buggy client can't fetch
  more than the function computes.
- Fail-soft like Health/Notifications: no link (or missing table) renders a
  setup hint with the mint/redeem UI, never an error.

### 3. Buddy nudges
- Two pushes through the existing `push-send` infrastructure:
  - "Alex just finished Legs day" when your buddy logs a complete workout
    (client fires it on session completion, server resolves the link and
    delivers to the buddy's subscriptions).
  - A Sunday combo-streak line folded into the existing weekly nudge when both
    of you hit target ("4 weeks straight — both of you"). The shared streak is
    the motivating mechanic; it's a small computation over `weekStart` slices.
- Both opt-in, riding the existing notification toggle.

## Data / schema changes
- `buddy_links` — `user_a`, `user_b` (pk on the pair), plus a `code` column on
  the minting side or a tiny `buddy_codes` table for the pending-invite state.
  RLS: a user can select/delete rows containing their own uid; inserts happen
  via the redeem path.
- New `buddy-status` edge function; `push-send` gains the buddy-finished
  message type. No Anthropic calls anywhere, but `buddy-status` should still
  take a generous `fn_usage` cap for abuse symmetry.
- Migration documented in `README.md` per convention.

## Out of scope
- More than one buddy, feeds, comments, reactions — every one of these is
  where the social-network creep starts, and none add accountability.
- Sharing weights, PRs, or any set-level data. A v2 could add opt-in PR
  sharing piggybacking on the `PRToast` moment if the basic loop proves out.
- In-app messaging. Text your buddy.

## Dependency
- Push infrastructure (Phase 10, shipped); invite-only deployment + quota
  plumbing (Phase 11, shipped).

## As shipped (July 2026)

Built as designed, with these concretizations:

- The "code column or tiny table" question resolved to the tiny table:
  `buddy_codes` (user_id pk, code unique), the `sync_tokens` pattern exactly.
  Codes are human-typed — 8 chars, `XXXX-XXXX`, an alphabet without 0/O/1/I/L
  — single-use, and consumed (both sides' pending codes) on redeem.
- The sharing contract lives in one `buddy-status` edge function (status +
  redeem). Mint and unlink stayed client-side RLS writes: `buddy_codes` is
  own-rows, and either member may delete the `buddy_links` row — deleting
  *is* the unlink. Links store `user_a < user_b`; per-column unique indexes
  enforce one-buddy-per-user against redeem races.
- "Whether today's workout is done" is computed server-side from set *counts*
  vs the buddy's plan (day chosen by the same majority-vote rule as
  `planUtils.buildDayIndex`, completion = every slot at its set count + the
  finisher) — so the card can honestly say "Finished Push day ✓" while still
  sharing no numbers. Callers pass their local date; log dates are
  client-local.
- The finished-session push fires from `RackedTracker` only when a *live*
  session completes (never on reopen or backfill), gated by a localStorage
  linked flag so logging never awaits a lookup. The combo-streak line rides
  the existing Sunday cron payload per-user; a missing `buddy_links` table
  degrades to the plain nudge.
- Display names are the email local part — the app has no profile concept,
  and inventing one for this was scope creep.

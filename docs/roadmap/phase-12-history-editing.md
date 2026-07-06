# Phase 12 — Set History Editing

Fix the append-only gap. From the UI, `logs` can only grow (`addLogEntry`) or
be wiped (`clearAllLogs`) — one fat-fingered entry (185 typed as 855) is
permanent, and it's worse here than in most trackers because
`computeSuggestion` treats the session's *last set* as the verdict: a typo
corrupts the next suggestion and the deload scan, not just a chart. This phase
adds edit/delete for individual sets and backfill for forgotten workouts,
through the existing storage/optimistic-update/queue machinery.

## Features

### 1. Edit and delete individual sets
- Entry point is the raw per-session set list already rendered in
  `ExerciseDetail` (Phase 7): each row gets edit (weight/reps/effort/note) and
  delete affordances.
- New `updateLogEntry`/`deleteLogEntry` in `src/storage.js`; `AppState` applies
  them optimistically with rollback + error banner, same as every other write.
- Requires the client to know each row's primary key: return the `id` from
  inserts and include it in `loadLogs` reads. Today's UI keys sets positionally,
  so this is the load-bearing plumbing change.

### 2. Backfill past workouts
- Log a set for a past date: a date picker on the workout view (or session
  header) that redirects `addLogEntry`'s date. `buildDayIndex`/`dayForDate`
  already vote dates onto plan days, so the right day's exercises come up
  automatically.
- Backfilled sets flow through progression identically — "last entry" is by
  date, so a backfill older than the latest session doesn't disturb the current
  suggestion.

### 3. Offline queue semantics
- An edit or delete targeting an entry that is still *pending* in the sync
  queue must rewrite or drop the queued op in place — never emit a server
  update/delete for a row that doesn't exist yet. Pending entries have no
  server id, so the queue needs client-side temp ids to correlate.
- Edits/deletes that fail on a network error queue behind pending ops like any
  other write (FIFO order still preserves "last entry" correctness).

## Data / schema changes
- No new tables or columns (`logs` already has an `id` pk).
- New RLS policies: `update` and `delete` on `logs` scoped to
  `auth.uid() = user_id` — the original setup only needed select/insert.
  Documented in `README.md` as a copy-pasteable migration block; fail-soft is
  trivial (missing policies just surface the existing red error banner).

## Out of scope
- Editing or deleting weigh-ins (same pattern, different surface — a natural
  fast-follow, not this phase).
- Bulk import / re-import of exported JSON/CSV.
- Any change to how progression interprets history — this phase makes the data
  correctable, not the engine smarter.

## Shipped notes (July 2026)

Where the implementation diverged from (or refined) the plan above:

- **No RLS migration was needed.** The plan assumed the original policies were
  select/insert-only, but Phase 4 created `"Own rows" on logs for all`, which
  already covers update/delete. README's Phase 12 section documents this and
  carries the policy SQL only for forks that tightened it.
- **Temp-id correlation is broader than the queue.** Every new entry gets a
  client id (`storage.newClientId`) at log time — not just queued ones — so a
  set is editable immediately. When its insert lands, `performOp` records the
  temp→server id mapping (`insert ... select id`); edits translate through it.
  The queue-rewrite path (`syncQueue.rewriteOps`) handles the still-pending
  case: edits fold into the queued insert's row, deletes drop the op.
- **Queued update/delete ops are layered onto reads** the same way pending
  inserts always were, so an offline edit survives a reload against the
  snapshot. Entries from a pre-Phase-12 snapshot have no id and render
  read-only rather than erroring.
- **Edits change weight/reps/effort (and keep note), never the date** — moving
  a set between days stays out of scope; delete + backfill covers it.
- **Backfill suppresses the rest timer, rest push, and PR toast** (a "PR"
  judged only against history before a past date may not be an all-time best),
  and the whole workout view — set counts, finisher, completion — re-anchors
  on the picked date. Picking a date whose logs vote a plan day wins switches
  the active tab automatically (`dayForDate`); a blank date leaves the tab
  for the user to choose.

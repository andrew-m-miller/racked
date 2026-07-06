import { supabase } from "./supabaseClient.js";
import { runOrQueue, flush, pendingOps, isNetworkError, discardOps } from "./syncQueue.js";
import { scopedKey } from "./storageScope.js";

export { pendingCount, onPendingChange } from "./syncQueue.js";

// ---- offline plumbing ----

// A queued write is just the table + row it would have inserted.
async function performOp(op) {
  const { error } = await supabase.from(op.table).insert(op.row);
  if (error) throw error;
}

// Replay queued offline writes; returns how many are still pending.
export function flushPending() {
  return flush(performOp);
}

// Last successful server reads, so the app can cold-start in a dead-zone.
// Snapshot holds server truth only — queued offline writes are layered on
// top at read time, which keeps the two from double-counting. Scoped per
// user (storageScope.js) so an offline cold start can't render a previous
// account's data on a shared browser.
const SNAP_KEY = "racked-snapshot-v1";

function readSnapshot() {
  try {
    return JSON.parse(localStorage.getItem(scopedKey(SNAP_KEY))) || {};
  } catch {
    return {};
  }
}

function saveSnapshot(key, value) {
  try {
    localStorage.setItem(scopedKey(SNAP_KEY), JSON.stringify({ ...readSnapshot(), [key]: value }));
  } catch {
    // best-effort cache only
  }
}

// Fetch fresh data and cache it; fall back to the cached copy when offline.
async function fetchWithSnapshot(key, fetcher) {
  try {
    const data = await fetcher();
    saveSnapshot(key, data);
    return data;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const cached = readSnapshot()[key];
    if (cached === undefined) throw err;
    return cached;
  }
}

// ---- logs ----

// Loads every logged set, grouped by exercise slug: { [slug]: [{date, weight, reps}, ...] }
// weight/reps come back as strings so falsy-check patterns like `last.reps || "?"`
// in the UI keep working the same way they did with the old localStorage shape.
export async function loadLogs() {
  const logs = await fetchWithSnapshot("logs", async () => {
    const { data, error } = await supabase
      .from("logs")
      .select("exercise_slug, date, weight, reps, effort, note")
      .order("date", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw error;

    const bySlug = {};
    for (const row of data) {
      const entry = {
        date: row.date,
        weight: row.weight == null ? "" : String(row.weight),
        reps: row.reps == null ? "" : String(row.reps),
        effort: row.effort ?? null, // -1 easy · 0 right · 1 brutal · null unrated
        note: row.note ?? null, // finisher machine/mode
      };
      (bySlug[row.exercise_slug] ??= []).push(entry);
    }
    return bySlug;
  });

  // Layer queued offline writes on top so they survive a reload.
  const merged = { ...logs };
  for (const op of pendingOps()) {
    if (op.table !== "logs") continue;
    const r = op.row;
    merged[r.exercise_slug] = [
      ...(merged[r.exercise_slug] || []),
      {
        date: r.date,
        weight: r.weight == null ? "" : String(r.weight),
        reps: r.reps == null ? "" : String(r.reps),
        effort: r.effort ?? null,
        note: r.note ?? null,
      },
    ];
  }
  return merged;
}

export async function addLogEntry(exerciseSlug, date, weight, reps, effort = null, note = null) {
  const row = {
    exercise_slug: exerciseSlug,
    date,
    weight: weight === "" ? null : Number(weight),
    reps: reps === "" ? null : Number(reps),
    effort,
    // Only send `note` when set, so logging still works before the Phase 4
    // migration adds the column.
    ...(note ? { note } : {}),
  };
  return runOrQueue(performOp, { table: "logs", row });
}

export async function clearAllLogs() {
  // Defense in depth: RLS already scopes deletes to the signed-in user, but an
  // explicit user_id filter keeps a misconfigured policy from wiping other rows.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  discardOps((op) => op.table === "logs");
  saveSnapshot("logs", {});
  const { error } = await supabase.from("logs").delete().eq("user_id", session.user.id);
  if (error) throw error;
}

// ---- weigh-ins ----

// Weigh-ins come back oldest-first as [{date, weight}] with weight as a
// string, matching the shape conventions of loadLogs().
export async function loadWeighIns() {
  const weighIns = await fetchWithSnapshot("weighIns", async () => {
    const { data, error } = await supabase
      .from("weigh_ins")
      .select("date, weight_lb")
      .order("date", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw error;
    return data.map((row) => ({ date: row.date, weight: row.weight_lb == null ? "" : String(row.weight_lb) }));
  });

  const pending = pendingOps()
    .filter((op) => op.table === "weigh_ins")
    .map((op) => ({ date: op.row.date, weight: String(op.row.weight_lb) }));
  return [...weighIns, ...pending];
}

export async function addWeighIn(date, weightLb) {
  return runOrQueue(performOp, { table: "weigh_ins", row: { date, weight_lb: Number(weightLb) } });
}

// ---- plan ----

// The plan lives one row per user as jsonb ({meta: {...}, days: [...]});
// exercises.json is the seed/fallback when no row exists yet. RLS scopes the
// select to the signed-in user, so no explicit filter is needed. The
// localStorage snapshot (racked-snapshot-v1) stays device-scoped — same
// accepted limitation as logs today.
export async function loadPlan() {
  return fetchWithSnapshot("plan", async () => {
    const { data, error } = await supabase.from("plan").select("data").maybeSingle();
    if (error) throw error;
    return data?.data ?? null;
  });
}

// ---- coach runs ----

// Weekly coach reviews, one row per (user, week): {week_start, review, applied}
// where review is the edge function's {narrative, suggestions[]} and applied
// maps suggestion index -> {inverse} for one-tap undo. Newest week first.
// Fail-soft at the call site: before the coach_runs migration runs, loading
// throws and the app just works live-only with no history.
export async function loadCoachRuns() {
  return fetchWithSnapshot("coachRuns", async () => {
    const { data, error } = await supabase
      .from("coach_runs")
      .select("week_start, review, applied")
      .order("week_start", { ascending: false });
    if (error) throw error;
    return data.map((r) => ({ week_start: r.week_start, review: r.review, applied: r.applied || {} }));
  });
}

export async function saveCoachRun(run) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const { error } = await supabase
    .from("coach_runs")
    .upsert(
      {
        user_id: session.user.id,
        week_start: run.week_start,
        review: run.review,
        applied: run.applied,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,week_start" }
    );
  if (error) throw error;
  const cached = readSnapshot().coachRuns;
  if (Array.isArray(cached)) {
    saveSnapshot("coachRuns", [
      ...cached.filter((r) => r.week_start !== run.week_start),
      { week_start: run.week_start, review: run.review, applied: run.applied },
    ].sort((a, b) => (a.week_start < b.week_start ? 1 : -1)));
  }
}

// ---- health sync token (Phase 10) ----

// One token per user authenticates the Apple Shortcuts / Health Connect
// bridge against the health-sync edge function. RLS scopes the row to its
// owner; the edge function resolves token → user with the service role.
// All three fail hard if the sync_tokens table doesn't exist yet — the
// setup UI catches and points at the README migration.
export async function loadSyncToken() {
  const { data, error } = await supabase.from("sync_tokens").select("token").maybeSingle();
  if (error) throw error;
  return data?.token ?? null;
}

export async function saveSyncToken(token) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const { error } = await supabase
    .from("sync_tokens")
    .upsert({ user_id: session.user.id, token }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function deleteSyncToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const { error } = await supabase.from("sync_tokens").delete().eq("user_id", session.user.id);
  if (error) throw error;
}

// ---- push subscriptions (Phase 10) ----

// One row per browser/device push subscription (endpoint is globally unique,
// so it's the pk). The push-send edge function reads these server-side and
// prunes rows whose endpoint the push service reports gone.
export async function savePushSubscription(sub) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ endpoint: sub.endpoint, user_id: session.user.id, keys: sub.keys }, { onConflict: "endpoint" });
  if (error) throw error;
}

export async function deletePushSubscription(endpoint) {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}

export async function savePlan(planData) {
  // getSession reads the cached session locally — no network round-trip.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const { error } = await supabase
    .from("plan")
    .upsert(
      { user_id: session.user.id, data: planData, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) throw error;
  saveSnapshot("plan", planData);
}

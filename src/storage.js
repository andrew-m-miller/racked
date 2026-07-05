import { supabase } from "./supabaseClient.js";
import { runOrQueue, flush, pendingOps, isNetworkError, discardOps } from "./syncQueue.js";

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
// top at read time, which keeps the two from double-counting.
const SNAP_KEY = "racked-snapshot-v1";

function readSnapshot() {
  try {
    return JSON.parse(localStorage.getItem(SNAP_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSnapshot(key, value) {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify({ ...readSnapshot(), [key]: value }));
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

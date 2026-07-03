import { supabase } from "./supabaseClient.js";

// Loads every logged set, grouped by exercise slug: { [slug]: [{date, weight, reps}, ...] }
// weight/reps come back as strings so falsy-check patterns like `last.reps || "?"`
// in the UI keep working the same way they did with the old localStorage shape.
export async function loadLogs() {
  const { data, error } = await supabase
    .from("logs")
    .select("exercise_slug, date, weight, reps, effort")
    .order("date", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;

  const logs = {};
  for (const row of data) {
    const entry = {
      date: row.date,
      weight: row.weight == null ? "" : String(row.weight),
      reps: row.reps == null ? "" : String(row.reps),
      effort: row.effort ?? null, // -1 easy · 0 right · 1 brutal · null unrated
    };
    (logs[row.exercise_slug] ??= []).push(entry);
  }
  return logs;
}

export async function addLogEntry(exerciseSlug, date, weight, reps, effort = null) {
  const { error } = await supabase.from("logs").insert({
    exercise_slug: exerciseSlug,
    date,
    weight: weight === "" ? null : Number(weight),
    reps: reps === "" ? null : Number(reps),
    effort,
  });
  if (error) throw error;
}

export async function clearAllLogs() {
  const { error } = await supabase.from("logs").delete().not("id", "is", null);
  if (error) throw error;
}

// Weigh-ins come back oldest-first as [{date, weight}] with weight as a
// string, matching the shape conventions of loadLogs().
export async function loadWeighIns() {
  const { data, error } = await supabase
    .from("weigh_ins")
    .select("date, weight_lb")
    .order("date", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return data.map((row) => ({ date: row.date, weight: row.weight_lb == null ? "" : String(row.weight_lb) }));
}

export async function addWeighIn(date, weightLb) {
  const { error } = await supabase.from("weigh_ins").insert({ date, weight_lb: Number(weightLb) });
  if (error) throw error;
}

// The plan lives in a single-row table as jsonb ({days: [...]}); exercises.json
// is the seed/fallback when no row exists yet.
export async function loadPlan() {
  const { data, error } = await supabase.from("plan").select("data").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

export async function savePlan(planData) {
  const { error } = await supabase
    .from("plan")
    .upsert({ id: 1, data: planData, updated_at: new Date().toISOString() });
  if (error) throw error;
}

import { supabase } from "./supabaseClient.js";

// Loads every logged set, grouped by exercise slug: { [slug]: [{date, weight, reps}, ...] }
// weight/reps come back as strings so falsy-check patterns like `last.reps || "?"`
// in the UI keep working the same way they did with the old localStorage shape.
export async function loadLogs() {
  const { data, error } = await supabase
    .from("logs")
    .select("exercise_slug, date, weight, reps")
    .order("date", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;

  const logs = {};
  for (const row of data) {
    const entry = { date: row.date, weight: row.weight == null ? "" : String(row.weight), reps: row.reps == null ? "" : String(row.reps) };
    (logs[row.exercise_slug] ??= []).push(entry);
  }
  return logs;
}

export async function addLogEntry(exerciseSlug, date, weight, reps) {
  const { error } = await supabase.from("logs").insert({
    exercise_slug: exerciseSlug,
    date,
    weight: weight === "" ? null : Number(weight),
    reps: reps === "" ? null : Number(reps),
  });
  if (error) throw error;
}

export async function clearAllLogs() {
  const { error } = await supabase.from("logs").delete().not("id", "is", null);
  if (error) throw error;
}

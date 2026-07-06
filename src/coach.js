import { supabase } from "./supabaseClient.js";

// Client for the `coach` Edge Function (see supabase/functions/coach). Kept
// out of the view components so nothing under src/*.jsx talks to Supabase
// directly — same boundary rule as storage.js, for a function instead of a
// table. Returns the parsed {narrative, suggestions[]} review or throws.
export async function requestCoachReview({ recap, days }) {
  const { data, error } = await supabase.functions.invoke("coach", {
    body: {
      recap,
      plan: {
        days: days.map((d) => ({
          name: d.name,
          exercises: d.exercises.map(({ name, sets, reps }) => ({ name, sets, reps })),
        })),
      },
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

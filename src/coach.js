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

// User-facing message for a failed edge-function call. supabase-js surfaces
// an undeployed function as a 404 / "Failed to send" fetch error; everything
// else shows its own message. Shared by the coach and plan-designer call
// sites so the wording (and the error-shape sniffing) lives in one place.
export function backendErrorMessage(err, name) {
  return /not found|404|Failed to send/i.test(String(err?.message))
    ? `${name} backend isn't deployed yet — see the README for the one-time Edge Function setup.`
    : String(err?.message || "Something went wrong — try again.");
}

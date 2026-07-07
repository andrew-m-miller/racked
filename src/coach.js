import { supabase } from "./supabaseClient.js";
import { normalizeCycle } from "./cycleUtils.js";

// Client for the `coach` Edge Function (see supabase/functions/coach). Kept
// out of the view components so nothing under src/*.jsx talks to Supabase
// directly — same boundary rule as storage.js, for a function instead of a
// table. Returns the parsed {narrative, suggestions[]} review or throws.
// `meta`/`today` are optional (Phase 15): they carry the mesocycle state and
// the caller's local date so the coach can program the next block — log
// dates are client-local, so the server can't derive "today" itself.
export async function requestCoachReview({ recap, days, meta, today }) {
  const cycle = normalizeCycle(meta?.cycle);
  const { data, error } = await supabase.functions.invoke("coach", {
    body: {
      recap,
      today,
      plan: {
        days: days.map((d) => ({
          name: d.name,
          exercises: d.exercises.map(({ name, sets, reps }) => ({ name, sets, reps })),
        })),
        ...(cycle ? { cycle } : {}),
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

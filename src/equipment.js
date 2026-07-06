import { slug } from "./planUtils.js";

// ---- Travel mode (Phase 13) ----
// Equipment-constrained sessions: a fixed profile walks the plan and bulk-
// swaps each exercise to its best matching alternate via the existing
// session-swap mechanism. Tags live on the plan jsonb / bundled seed;
// untagged exercises (pre-Phase-13 AI plans) fall back to a name-based guess,
// and an exercise with no fitting option is left for the manual swap picker.

export const EQUIP_TAGS = ["barbell", "dumbbell", "machine", "cable", "bodyweight"];

// "Hotel gym" reads a cable stack as a machine in spirit — most hotel multi-
// gyms are cable stacks, and excluding cable would strand lat pulldowns in a
// room that has one. Lighter profiles include bodyweight: no equipment is a
// subset of some equipment.
export const TRAVEL_PROFILES = [
  { id: "bodyweight", label: "Bodyweight", allowed: ["bodyweight"] },
  { id: "dumbbells", label: "Dumbbells", allowed: ["dumbbell", "bodyweight"] },
  { id: "hotel", label: "Hotel gym", allowed: ["dumbbell", "machine", "cable", "bodyweight"] },
];

// Name-based fallback for untagged exercises. Bodyweight is decided by the
// start field (the same signal planUtils.isBodyweightEx trusts); the name
// patterns run most-specific first so "Smith Machine Squat" lands on machine
// and "Dumbbell Romanian Deadlift" on dumbbell, not barbell. Unknown → null:
// a null tag never matches a profile, so the exercise falls through to its
// alts and then to the manual picker.
export function guessEquipment(ex) {
  if ((ex.start || "").trim() === "Bodyweight") return "bodyweight";
  const name = (ex.name || "").toLowerCase();
  if (/dumbbell|\bdb\b|goblet/.test(name)) return "dumbbell";
  if (/cable|pushdown|pulldown/.test(name)) return "cable";
  if (/machine|leg press|hack squat|leg curl|leg extension|back extension|pec deck/.test(name)) return "machine";
  if (/barbell|ez-bar|trap bar|rack pull|deadlift/.test(name)) return "barbell";
  return null;
}

export function exEquipment(ex) {
  return EQUIP_TAGS.includes(ex.equip) ? ex.equip : guessEquipment(ex);
}

// Walk the plan and compute the session swap map for an equipment profile:
// keep primaries that fit, swap the rest to their first fitting alt (seed alts
// are ordered closest-substitute-first, so first fit = best fit). Returns the
// swaps in RackedTracker's session shape ({primarySlug: altName}) plus the
// primary slugs with no fitting option at all, which stay unswapped and keep
// their manual picker. Covers every day, not just the active one, so the
// constraint holds when the user changes day tabs mid-trip.
export function profileSwaps(days, profileId) {
  const profile = TRAVEL_PROFILES.find((p) => p.id === profileId);
  const swaps = {};
  const unmatched = [];
  if (!profile) return { swaps, unmatched };
  const seen = new Set();
  for (const day of days) {
    for (const ex of day.exercises) {
      const key = slug(ex.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const tag = exEquipment(ex);
      if (tag && profile.allowed.includes(tag)) continue; // primary fits as-is
      const alt = (ex.alts || []).find((a) => {
        const t = exEquipment(a);
        return t && profile.allowed.includes(t);
      });
      if (alt) swaps[key] = alt.name;
      else unmatched.push(key);
    }
  }
  return { swaps, unmatched };
}

import { isTimeBased, isBodyweightEx } from "./planUtils.js";

// ---- Progression engine ----
// Extracted from RackedTracker.jsx so the weekly recap can reuse the same
// suggestions the exercise cards show.

// pull the top-of-range target number out of a reps string like "12", "10/leg", "30-45 sec"
export function targetNumber(repsStr) {
  const nums = (repsStr.match(/\d+/g) || []).map(Number);
  return nums.length ? nums[nums.length - 1] : null;
}

// pull a usable numeric baseline out of a start-weight string like "30–35 lb DB"
export function startNumber(startStr) {
  const nums = (startStr.match(/\d+(\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  return Math.round((nums[0] + nums[1]) / 2 / 2.5) * 2.5;
}

export const INCREMENT = { Upper: 5, Lower: 10, Core: 5 }; // lb, lb, seconds

export function computeSuggestion(ex, history) {
  const isBodyweight = isBodyweightEx(ex);
  const timeBased = isTimeBased(ex);
  const target = targetNumber(ex.reps);
  const baseline = startNumber(ex.start);

  if (!history || history.length === 0) {
    if (timeBased) {
      return { text: `Start: hold to ${ex.reps}`, value: String(target ?? ""), trend: "flat", detail: "No sessions logged yet" };
    }
    return {
      text: isBodyweight ? `Start: hit ${ex.reps} reps` : `Start: ${baseline ?? "—"} lb`,
      value: isBodyweight ? "" : String(baseline ?? ""),
      trend: "flat",
      detail: "No sessions logged yet",
    };
  }

  const last = history[history.length - 1];
  const lastWeight = parseFloat(last.weight) || 0; // lb, or seconds held for time-based holds
  const lastReps = parseFloat(last.reps) || 0;
  const lastPrimary = timeBased ? lastWeight : lastReps;
  const hitTarget = target ? lastPrimary >= target : true;
  const lastEffort = last.effort == null ? null : Number(last.effort); // -1 easy · 0 right · 1 brutal

  if (timeBased) {
    const inc = INCREMENT[ex.cat] || 5;
    if (hitTarget) {
      return {
        text: `Try +5-10 sec this time`,
        value: String(lastWeight + inc),
        trend: "up",
        detail: `Last: held ${lastWeight || "?"} sec × ${last.reps || "?"} reps`,
      };
    }
    return {
      text: `Hold ${ex.reps} again — focus on form`,
      value: String(lastWeight),
      trend: "flat",
      detail: `Last: held ${lastWeight || "?"} sec × ${last.reps || "?"} reps`,
    };
  }

  if (isBodyweight) {
    if (hitTarget) {
      return { text: `Try to add a rep or two`, value: "", trend: "up", detail: `Last: ${lastReps || "?"} reps — hit target` };
    }
    return { text: `Aim for ${ex.reps} again`, value: "", trend: "flat", detail: `Last: ${lastReps || "?"} reps — under target` };
  }

  const inc = INCREMENT[ex.cat] || 5;

  // consecutive misses, most recent first; a hit that was rated "brutal"
  // counts as a half-miss toward the deload trigger. Only weighted lifts
  // deload, so this scan lives below the timed/bodyweight early returns.
  let missScore = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const v = parseFloat(history[i].reps) || 0;
    const t = target || 0;
    if (v < t) missScore += 1;
    else if (Number(history[i].effort) === 1) missScore += 0.5;
    else break;
  }

  if (missScore >= 2) {
    const deload = Math.round((lastWeight * 0.9) / 2.5) * 2.5;
    return {
      text: `Deload to ${deload} lb`,
      value: String(deload),
      trend: "down",
      detail: hitTarget ? "Hitting reps but grinding — reset and rebuild" : `Missed target ${Math.floor(missScore)} sessions in a row`,
    };
  }

  if (hitTarget) {
    if (lastEffort === 1) {
      return {
        text: `Hold at ${lastWeight} lb — make it feel solid`,
        value: String(lastWeight),
        trend: "flat",
        detail: "Hit target but felt brutal last time",
      };
    }
    const jump = lastEffort === -1 && ex.cat === "Lower" ? inc * 2 : inc;
    const next = lastWeight + jump;
    return {
      text: `Try ${next} lb`,
      value: String(next),
      trend: "up",
      detail: jump > inc ? "Felt easy — take the bigger jump" : `Last: ${lastWeight} lb × ${last.reps} — hit target`,
    };
  }

  return {
    text: `Hold at ${lastWeight} lb`,
    value: String(lastWeight),
    trend: "flat",
    detail: `Last: ${lastWeight} lb × ${last.reps} — under target`,
  };
}

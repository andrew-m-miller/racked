import { useEffect, useRef } from "react";
import { useAppState } from "./AppState.jsx";
import { buildWeeklyRecap } from "./recap.js";
import { requestCoachReview } from "./coach.js";
import { pendingAutoReview } from "./coachUtils.js";
import { localDateKey } from "./planUtils.js";
import { scopedKey } from "./storageScope.js";

// Opt-in weekly check-in (Phase 9): on the first open of a new week, review
// the week that just finished and cache the result, so the coach's read is
// already waiting when the Progress tab opens — the client-side stand-in for
// the roadmap's Sunday-night cron. Device-scoped toggle (localStorage), off
// by default since a run spends an API call.
export const AUTO_COACH_KEY = "racked-coach-auto";

export function autoCoachEnabled() {
  try {
    return localStorage.getItem(scopedKey(AUTO_COACH_KEY)) === "1";
  } catch {
    return false;
  }
}

export function setAutoCoachEnabled(on) {
  try {
    if (on) localStorage.setItem(scopedKey(AUTO_COACH_KEY), "1");
    else localStorage.removeItem(scopedKey(AUTO_COACH_KEY));
  } catch {
    // storage blocked — the toggle just won't stick
  }
}

export function useAutoCoach() {
  const { loaded, logs, days, weighIns, planMeta, coachRuns, recordCoachRun } = useAppState();
  const firedRef = useRef(false);

  useEffect(() => {
    // coachRuns === null means the runs table couldn't be read — without
    // knowing what's already cached, auto-running could spend an API call on
    // every open, so stay quiet.
    if (!loaded || firedRef.current || coachRuns === null || !autoCoachEnabled()) return;
    const due = pendingAutoReview({ today: localDateKey(), runs: coachRuns, logs });
    firedRef.current = true; // one attempt per app session, even on failure
    if (!due) return;
    const recap = buildWeeklyRecap({ days, logs, weighIns, today: due.recapDay, meta: planMeta });
    requestCoachReview({ recap, days, meta: planMeta, today: due.recapDay })
      .then((review) => recordCoachRun({ week_start: due.weekStart, review, applied: {} }))
      .catch(() => {
        // best-effort pre-warm; the manual button still works
      });
  }, [loaded, logs, days, weighIns, planMeta, coachRuns, recordCoachRun]);
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadLogs, addLogEntry, clearAllLogs, loadWeighIns, addWeighIn, loadPlan, savePlan, flushPending, onPendingChange } from "./storage.js";
import { SEED_DAYS, SEED_META } from "./planUtils.js";

// Shared data root: logs / weigh-ins / plan, their loaders, and the
// optimistic-update-with-rollback writes, lifted out of RackedTracker so
// views read what they need from context instead of deep prop chains.
// Everything here still goes through src/storage.js — this layer only owns
// the in-memory copy the UI renders. View-specific reactions to a write
// (rest timer, PR toast, swap resets) stay with the views.
const AppStateContext = createContext(null);

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside <AppStateProvider>");
  return ctx;
}

export function AppStateProvider({ children }) {
  const [logs, setLogs] = useState({}); // { slug: [{date,weight,reps}, ...] }
  const [weighIns, setWeighIns] = useState([]); // [{date, weight}]
  const [days, setDays] = useState(SEED_DAYS); // live plan; Supabase row wins over the bundled seed
  const [planMeta, setPlanMeta] = useState(SEED_META); // goal/daysPerWeek/description for the live plan
  const [loaded, setLoaded] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false); // no plan row + no logs → offer onboarding
  const [saveError, setSaveError] = useState(false);
  const [pendingSync, setPendingSync] = useState(0); // offline writes waiting to upload

  // Offline queue: track how many writes are parked, and replay them the
  // moment the connection comes back.
  useEffect(() => {
    const unsubscribe = onPendingChange(setPendingSync);
    const onOnline = () => flushPending().catch(() => setSaveError(true));
    window.addEventListener("online", onOnline);
    return () => {
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Weigh-ins and the cloud plan degrade gracefully: if their tables don't
    // exist yet, the rest of the app still works (plan falls back to the seed).
    // loadPlan maps a failure to undefined so "no row yet" (null) stays
    // distinguishable — only a genuinely blank account gets onboarding.
    Promise.all([loadLogs(), loadWeighIns().catch(() => []), loadPlan().catch(() => undefined)])
      .then(([logData, weighData, planData]) => {
        if (!cancelled) {
          setLogs(logData);
          setWeighIns(weighData);
          setDays(planData?.days?.length ? planData.days : SEED_DAYS);
          setPlanMeta(planData?.meta ?? SEED_META);
          setIsNewUser(planData === null && Object.keys(logData).length === 0);
        }
      })
      .catch(() => {
        if (!cancelled) setSaveError(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Append one logged set under `key`. Updates optimistically so the UI feels
  // instant; a functional updater keeps concurrent writes from clobbering each
  // other, and rollback drops just this entry (by reference) so an in-flight
  // sibling write survives a failure here.
  const logEntry = useCallback((key, entry) => {
    setLogs((prev) => ({ ...prev, [key]: [...(prev[key] || []), entry] }));
    addLogEntry(key, entry.date, entry.weight, entry.reps, entry.effort ?? null, entry.note ?? null)
      .then(() => setSaveError(false))
      .catch(() => {
        setLogs((prev) => ({ ...prev, [key]: (prev[key] || []).filter((x) => x !== entry) }));
        setSaveError(true);
      });
  }, []);

  const logWeighIn = useCallback((date, weightLb) => {
    const entry = { date, weight: String(weightLb) };
    setWeighIns((prev) => [...prev, entry].sort((a, b) => (a.date < b.date ? -1 : 1)));
    addWeighIn(date, weightLb)
      .then(() => setSaveError(false))
      .catch(() => {
        setWeighIns((prev) => prev.filter((x) => x !== entry));
        setSaveError(true);
      });
  }, []);

  const saveLivePlan = useCallback(async (nextDays, nextMeta) => {
    try {
      await savePlan({ meta: nextMeta, days: nextDays });
      setDays(nextDays);
      setPlanMeta(nextMeta);
      setIsNewUser(false); // the account has a plan row now — onboarding is offered once
      setSaveError(false);
    } catch (err) {
      setSaveError(true);
      throw err;
    }
  }, []);

  const clearLogs = useCallback(() => {
    const previousLogs = logs;
    setLogs({});
    return clearAllLogs()
      .then(() => setSaveError(false))
      .catch(() => {
        setLogs(previousLogs);
        setSaveError(true);
      });
  }, [logs]);

  const value = useMemo(
    () => ({
      logs,
      weighIns,
      days,
      planMeta,
      loaded,
      isNewUser,
      saveError,
      pendingSync,
      logEntry,
      logWeighIn,
      saveLivePlan,
      clearLogs,
    }),
    [logs, weighIns, days, planMeta, loaded, isNewUser, saveError, pendingSync, logEntry, logWeighIn, saveLivePlan, clearLogs]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

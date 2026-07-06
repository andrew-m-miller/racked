import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadLogs, addLogEntry, updateLogEntry, deleteLogEntry, clearAllLogs, loadWeighIns, addWeighIn, loadPlan, savePlan, loadCoachRuns, saveCoachRun, flushPending, onPendingChange, newClientId } from "./storage.js";
import { SEED_DAYS, SEED_META } from "./planUtils.js";
import { upsertRun } from "./coachUtils.js";

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
  // Cached weekly coach reviews, newest week first. null = load failed (e.g.
  // the coach_runs table doesn't exist yet), which disables auto-run and
  // history but leaves the live coach call working — fail-soft like weigh-ins.
  const [coachRuns, setCoachRuns] = useState(null);
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
    Promise.all([loadLogs(), loadWeighIns().catch(() => []), loadPlan().catch(() => undefined), loadCoachRuns().catch(() => null)])
      .then(([logData, weighData, planData, runData]) => {
        if (!cancelled) {
          setLogs(logData);
          setWeighIns(weighData);
          setDays(planData?.days?.length ? planData.days : SEED_DAYS);
          setPlanMeta(planData?.meta ?? SEED_META);
          setCoachRuns(runData);
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
  // sibling write survives a failure here. Every entry gets a client temp id
  // up front so it's editable/deletable immediately — storage translates it
  // to the server pk once the insert lands (Phase 12).
  const logEntry = useCallback((key, entry) => {
    const withId = { ...entry, id: newClientId() };
    setLogs((prev) => ({ ...prev, [key]: [...(prev[key] || []), withId] }));
    addLogEntry(key, withId.date, withId.weight, withId.reps, withId.effort ?? null, withId.note ?? null, withId.id)
      .then(() => setSaveError(false))
      .catch(() => {
        setLogs((prev) => ({ ...prev, [key]: (prev[key] || []).filter((x) => x !== withId) }));
        setSaveError(true);
      });
  }, []);

  // Edit one logged set in place (weight/reps/effort/note — never the date).
  // Optimistic patch by id with a rollback that restores the exact previous
  // entry object, so a failure can't leave a half-applied edit behind.
  const updateEntry = useCallback((key, id, fields) => {
    const previous = (logs[key] || []).find((x) => x.id === id);
    if (!previous) return;
    setLogs((prev) => ({ ...prev, [key]: (prev[key] || []).map((x) => (x.id === id ? { ...x, ...fields } : x)) }));
    updateLogEntry(id, fields)
      .then(() => setSaveError(false))
      .catch(() => {
        setLogs((prev) => ({ ...prev, [key]: (prev[key] || []).map((x) => (x.id === id ? previous : x)) }));
        setSaveError(true);
      });
  }, [logs]);

  // Delete one logged set. Rollback re-inserts the entry at its old index so
  // set order within the session survives a failed delete.
  const deleteEntry = useCallback((key, id) => {
    const entries = logs[key] || [];
    const index = entries.findIndex((x) => x.id === id);
    if (index < 0) return;
    const removed = entries[index];
    setLogs((prev) => ({ ...prev, [key]: (prev[key] || []).filter((x) => x.id !== id) }));
    deleteLogEntry(id)
      .then(() => setSaveError(false))
      .catch(() => {
        setLogs((prev) => {
          const arr = [...(prev[key] || [])];
          arr.splice(Math.min(index, arr.length), 0, removed);
          return { ...prev, [key]: arr };
        });
        setSaveError(true);
      });
  }, [logs]);

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

  // Upsert one week's coach run (review + applied map). Optimistic like the
  // other writes, but a failed save is non-fatal: the review is already on
  // screen, the cache is just insurance for next open — so no error banner,
  // and the in-memory copy is kept so undo state stays coherent this session.
  const recordCoachRun = useCallback((run) => {
    setCoachRuns((prev) => upsertRun(prev || [], run));
    saveCoachRun(run).catch(() => {});
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
      coachRuns,
      loaded,
      isNewUser,
      saveError,
      pendingSync,
      logEntry,
      updateEntry,
      deleteEntry,
      logWeighIn,
      saveLivePlan,
      recordCoachRun,
      clearLogs,
    }),
    [logs, weighIns, days, planMeta, coachRuns, loaded, isNewUser, saveError, pendingSync, logEntry, updateEntry, deleteEntry, logWeighIn, saveLivePlan, recordCoachRun, clearLogs]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

import React, { useState, useEffect, useRef } from "react";
import { Dumbbell, RotateCcw, BarChart3, Pencil, CloudOff, LogOut } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { SEED_DAYS, SEED_META, slug, exMetric, metricUnit, dayForDate, finisherSlug, localDateKey } from "./planUtils.js";
import { useAppState } from "./AppState.jsx";
import { useHashRoute } from "./useHashRoute.js";
import { useAutoCoach } from "./useAutoCoach.js";
import { pushEnabled, scheduleRestPush } from "./push.js";
import DayTabs from "./DayTabs.jsx";
import ExerciseCard from "./ExerciseCard.jsx";
import FinisherCard from "./FinisherCard.jsx";
import RestTimer from "./RestTimer.jsx";
import SessionSummary, { sessionStats } from "./SessionSummary.jsx";
import PRToast from "./PRToast.jsx";
import ExerciseDetail from "./ExerciseDetail.jsx";
import InsightStrip from "./InsightStrip.jsx";
import ProgressView from "./ProgressView.jsx";
import PlanEditor from "./PlanEditor.jsx";
import Onboarding from "./Onboarding.jsx";

const REST_SECONDS = 90;

// Pick the day tab to open on: the day still in progress if there are sets
// logged today, otherwise the next day in the rotation after the last
// session. Exercises shared across days (e.g. Seated Cable Row on A and C)
// would make a single-slug lookup ambiguous, so the day is chosen by majority
// vote over the latest session's entries.
function pickInitialDay(days, logs, today) {
  let latestDate = null;
  for (const entries of Object.values(logs)) {
    for (const e of entries) {
      if (!latestDate || e.date > latestDate) latestDate = e.date;
    }
  }
  if (!latestDate) return days[0]?.id;

  const lastDay = dayForDate(days, logs, latestDate);
  if (!lastDay) return days[0]?.id;
  if (latestDate === today) return lastDay;
  const order = days.map((d) => d.id);
  return order[(order.indexOf(lastDay) + 1) % order.length];
}

// Composition + state root: data comes from AppState, the visible view from
// the hash route; what lives here is the workout-session state (active day,
// rest timer, swaps, PR toast) and the handlers that tie them together.
export default function RackedTracker({ session }) {
  const { logs, weighIns, days, planMeta, loaded, isNewUser, saveError, pendingSync, logEntry, logWeighIn, saveLivePlan, clearLogs } =
    useAppState();
  const [route, navigate] = useHashRoute();
  const view = route.view; // "workout" | "progress" | "edit" | "onboard"
  useAutoCoach(); // opt-in weekly check-in: pre-runs the coach for the week that just ended

  const [activeDay, setActiveDay] = useState(SEED_DAYS[0].id);
  const [restEndsAt, setRestEndsAt] = useState(null);
  const [onboardMode, setOnboardMode] = useState("new"); // "new" first-run · "replace" from the plan editor
  const [swaps, setSwaps] = useState({}); // session-scoped substitutions: { primarySlug: altName }
  const [prToast, setPrToast] = useState(null);
  const sessionStartRef = useRef(null); // first set logged in this app session
  const prToastTimerRef = useRef(null);
  const didInitRef = useRef(false);

  useEffect(() => () => clearTimeout(prToastTimerRef.current), []);

  // Once the data is in: open on the right day tab, and send a genuinely
  // blank account into onboarding.
  useEffect(() => {
    if (!loaded || didInitRef.current) return;
    didInitRef.current = true;
    setActiveDay(pickInitialDay(days, logs, localDateKey()));
    if (isNewUser) {
      setOnboardMode("new");
      navigate("/onboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, days, logs, isNewUser]);

  // Onboarding is reachable by URL, but "new" mode's Skip saves the seed over
  // whatever plan exists — so only a blank account (or an explicit "replace"
  // entry from the plan editor) may stay; anyone else bounces to the workout.
  useEffect(() => {
    if (!loaded) return;
    if (view === "onboard" && !isNewUser && onboardMode !== "replace") navigate("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, view, isNewUser, onboardMode]);

  const day = days.find((d) => d.id === activeDay) || days[0];
  const today = localDateKey();

  // Session-scoped substitution: a swapped exercise takes the slot but keeps
  // its own slug, history, and progression.
  const effectiveExercise = (base) => {
    const altName = swaps[slug(base.name)];
    if (!altName) return base;
    const alt = (base.alts || []).find((a) => a.name === altName);
    return alt ? { ...base, name: alt.name, start: alt.start, url: alt.url } : base;
  };
  const activeExercises = day.exercises.map(effectiveExercise);

  // Resolve #/exercise/<slug> to a live exercise definition. The active swap
  // is checked first; primaries and alternates still resolve afterwards so a
  // deep link survives a reload (swaps are session-scoped and reset).
  const detailEx = (() => {
    if (!route.exerciseSlug) return null;
    for (const d of days) {
      for (const base of d.exercises) {
        const candidates = [
          effectiveExercise(base),
          base,
          ...(base.alts || []).map((alt) => ({ ...base, name: alt.name, start: alt.start, url: alt.url })),
        ];
        const hit = candidates.find((c) => slug(c.name) === route.exerciseSlug);
        if (hit) return hit;
      }
    }
    return null;
  })();

  const handleSwap = (base, altName) => {
    const key = slug(base.name);
    const next = { ...swaps };
    if (altName) next[key] = altName;
    else delete next[key];
    setSwaps(next);
  };

  const handleLog = (ex, weight, reps, effort) => {
    const key = slug(ex.name);
    const history = logs[key] || [];
    const entry = { date: today, weight, reps, effort: effort ?? null };
    logEntry(key, entry);
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();

    // PR celebration: only against history from before today, so the first
    // session (and each set after a PR today) doesn't re-trigger it.
    const prior = history.filter((h) => h.date < today);
    const bestPrior = prior.reduce((m, e) => Math.max(m, exMetric(ex, e)), 0);
    const value = exMetric(ex, entry);
    if (prior.length > 0 && value > bestPrior) {
      setPrToast(`New PR — ${ex.name}: ${value} ${metricUnit(ex)}`);
      if (navigator.vibrate) navigator.vibrate(100);
      clearTimeout(prToastTimerRef.current);
      prToastTimerRef.current = setTimeout(() => setPrToast(null), 4000);
    }
    // Rest between sets — but not after the last lifting set, where the
    // finisher (and then the session summary) takes over. Only this exercise's
    // count changed, so evaluate it against the just-added entry.
    const nextForKey = [...history, entry];
    const liftsDoneNow = activeExercises.every((e) => {
      const h = slug(e.name) === key ? nextForKey : logs[slug(e.name)] || [];
      return h.filter((x) => x.date === today).length >= e.sets;
    });
    setRestEndsAt(liftsDoneNow ? null : Date.now() + REST_SECONDS * 1000);
    // Backgrounded phones freeze the in-page timer (especially iOS PWAs), so
    // mirror it with a server-scheduled push; the service worker drops it if
    // the app is still on screen.
    if (!liftsDoneNow && pushEnabled()) scheduleRestPush(REST_SECONDS);
  };

  const handleLogFinisher = (minutes, mode) => {
    const key = finisherSlug(day.id);
    logEntry(key, { date: today, weight: "", reps: String(minutes), effort: null, note: mode || null });
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();
  };

  const handleSavePlan = async (nextDays, nextMeta = planMeta) => {
    await saveLivePlan(nextDays, nextMeta);
    setSwaps({});
    // The edited plan may have dropped the day that was open.
    if (!nextDays.some((d) => d.id === activeDay)) setActiveDay(nextDays[0]?.id);
  };

  // Apply a coach-suggested tweak ({exercise, sets, reps}, nulls = unchanged)
  // to the live plan. Matches by slug across all days, primaries only. Rejects
  // when nothing matches (the coach is told to only name plan exercises, but a
  // silent no-op here would show "Applied" for an edit that never happened).
  const handleApplyPlanChange = (change) => {
    const key = slug(change.exercise);
    let matched = false;
    const nextDays = days.map((d) => ({
      ...d,
      exercises: d.exercises.map((ex) => {
        if (slug(ex.name) !== key) return ex;
        matched = true;
        return {
          ...ex,
          ...(change.sets != null ? { sets: Number(change.sets) } : {}),
          ...(change.reps != null ? { reps: String(change.reps) } : {}),
        };
      }),
    }));
    if (!matched) return Promise.reject(new Error(`"${change.exercise}" isn't in the current plan`));
    return handleSavePlan(nextDays);
  };

  const resetAll = () => {
    if (!window.confirm || window.confirm("Clear all logged history? This can't be undone.")) {
      setRestEndsAt(null);
      sessionStartRef.current = null;
      clearLogs();
    }
  };

  const setsDoneFor = (ex) => (logs[slug(ex.name)] || []).filter((h) => h.date === today).length;
  const totalSets = activeExercises.reduce((n, ex) => n + ex.sets, 0);
  const setsDoneToday = activeExercises.reduce((n, ex) => n + Math.min(setsDoneFor(ex), ex.sets), 0);
  // A complete workout = every lift set logged AND the cardio finisher —
  // which is the point of the program.
  const finisherToday = (logs[finisherSlug(day.id)] || []).filter((e) => e.date === today);
  const finisherDone = finisherToday.length > 0;
  const cardioMin = finisherToday.reduce((n, e) => n + (parseFloat(e.reps) || 0), 0);
  const liftsDone = activeExercises.every((ex) => setsDoneFor(ex) >= ex.sets);
  const dayComplete = liftsDone && finisherDone;
  const stats = dayComplete ? sessionStats(activeExercises, logs, today) : null;
  const durationMin =
    dayComplete && sessionStartRef.current
      ? Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 60000))
      : null;

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: "#101214", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#6B7280", fontSize: 13 }}>Loading your log…</span>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#101214",
        padding: restEndsAt
          ? "calc(28px + env(safe-area-inset-top)) 16px calc(116px + env(safe-area-inset-bottom))"
          : "calc(28px + env(safe-area-inset-top)) 16px calc(60px + env(safe-area-inset-bottom))",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');
        input:focus { border-color: #6B7280 !important; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Dumbbell size={22} color="#F5F6F7" strokeWidth={2.25} />
            <h1
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontWeight: 700,
                fontSize: 26,
                letterSpacing: "0.04em",
                color: "#F5F6F7",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              Racked
            </h1>
          </div>
          {view !== "onboard" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => navigate(view === "workout" ? "/progress" : "/")}
              title={view === "workout" ? "Progress" : "Back to workout"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: view === "progress" ? "#1B1E22" : "transparent",
                border: `1px solid ${view === "progress" ? "#5EC8D8" : "#2A2E33"}`,
                borderRadius: 8,
                color: view === "progress" ? "#5EC8D8" : "#9AA1AC",
                cursor: "pointer",
                padding: "5px 10px",
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <BarChart3 size={14} />
              Progress
            </button>
            <button
              type="button"
              onClick={() => navigate(view === "edit" ? "/" : "/plan")}
              title={view === "edit" ? "Back to workout" : "Edit plan"}
              style={{
                display: "flex",
                alignItems: "center",
                background: view === "edit" ? "#1B1E22" : "transparent",
                border: `1px solid ${view === "edit" ? "#B9A6E0" : "#2A2E33"}`,
                borderRadius: 8,
                color: view === "edit" ? "#B9A6E0" : "#9AA1AC",
                cursor: "pointer",
                padding: "6px 8px",
              }}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={resetAll}
              title="Clear all history"
              style={{ background: "transparent", border: "none", color: "#3A3F45", cursor: "pointer", padding: 4 }}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          )}
        </div>
        {view !== "onboard" && (
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6B7280", margin: "0 0 14px" }}>
          {days.length}-day plan · your gym, your numbers
        </p>
        )}

        {pendingSync > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#33260F",
              border: "1px solid #FACC1555",
              borderRadius: 8,
              padding: "9px 12px",
              marginBottom: 16,
            }}
          >
            <CloudOff size={15} color="#FACC15" style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#FDE68A" }}>
              {pendingSync} {pendingSync === 1 ? "entry" : "entries"} pending sync — they'll upload when you're back online.
            </span>
          </div>
        ) : saveError ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              background: "#3A1416",
              border: "1px solid #EF444455",
              borderRadius: 8,
              padding: "9px 12px",
              marginBottom: 16,
            }}
          >
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#F5B4B4" }}>
              Couldn't reach the database — check your connection and try again.
            </span>
          </div>
        ) : null}

        {view === "progress" && <ProgressView onApplyPlanChange={handleApplyPlanChange} />}

        {view === "edit" && (
          <PlanEditor
            days={days}
            meta={planMeta}
            onSave={handleSavePlan}
            onClose={() => navigate("/")}
            onDesign={() => {
              setOnboardMode("replace");
              navigate("/onboard");
            }}
          />
        )}

        {view === "onboard" && (
          <Onboarding
            mode={onboardMode}
            onAccept={async ({ meta, days: nextDays }) => {
              await handleSavePlan(nextDays, meta);
              setActiveDay(nextDays[0]?.id);
              navigate("/");
            }}
            onSkip={() => {
              // Save the seed as this user's plan so onboarding is offered once;
              // a failed save just means they see it again next visit.
              handleSavePlan(SEED_DAYS, SEED_META).catch(() => {});
              navigate("/");
            }}
            onCancel={() => navigate("/plan")}
          />
        )}

        {view === "workout" && (
        <>
        {/* Weekly insight strip — hidden for a brand-new log */}
        {Object.keys(logs).length > 0 && <InsightStrip days={days} logs={logs} today={today} />}

        {/* Day selector */}
        <DayTabs days={days} activeDay={activeDay} onSelect={setActiveDay} />

        {/* Day title + progress */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <h2
            style={{
              fontFamily: "'Oswald', sans-serif",
              fontWeight: 600,
              fontSize: 18,
              color: "#F5F6F7",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.02em",
            }}
          >
            {day.name}
          </h2>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#6B7280" }}>
            {setsDoneToday}/{totalSets} sets today
          </span>
        </div>

        {/* Progress bar: lift sets + the finisher as one final segment */}
        <div style={{ height: 3, background: "#1B1E22", borderRadius: 2, marginBottom: 18, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${((setsDoneToday + (finisherDone ? 1 : 0)) / (totalSets + 1)) * 100}%`,
              background: day.plate,
              transition: "width 200ms ease",
            }}
          />
        </div>

        {/* Session summary — appears once every set of the day is logged */}
        {dayComplete && (
          <SessionSummary day={day} stats={stats} cardioMin={cardioMin} durationMin={durationMin} totalSets={totalSets} />
        )}

        {/* Exercise list */}
        {day.exercises.map((base) => {
          const ex = effectiveExercise(base);
          const key = slug(ex.name);
          const history = logs[key] || [];
          return (
            <ExerciseCard
              key={key}
              ex={ex}
              primary={base}
              history={history}
              setsDone={setsDoneFor(ex)}
              onLog={(w, r, effort) => handleLog(ex, w, r, effort)}
              onOpenChart={() => navigate(`/exercise/${key}`)}
              onSwap={(altName) => handleSwap(base, altName)}
            />
          );
        })}

        {/* Finisher */}
        <FinisherCard day={day} entries={finisherToday} onLog={handleLogFinisher} />
        </>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "center",
            marginTop: 24,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: "#3A3F45",
          }}
        >
          <span>{session?.user?.email || "logs synced to your account"}</span>
          {session && (
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              title="Sign out"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "transparent",
                border: "none",
                color: "#3A3F45",
                cursor: "pointer",
                padding: 2,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
              }}
            >
              <LogOut size={11} />
              sign out
            </button>
          )}
        </div>
      </div>

      {restEndsAt != null && (
        <RestTimer
          endsAt={restEndsAt}
          onExtend={() => {
            // Re-mirror the extension server-side; the same notification tag
            // collapses the earlier push if it lands first.
            if (pushEnabled()) scheduleRestPush(Math.max(1, Math.round((restEndsAt + 30000 - Date.now()) / 1000)));
            setRestEndsAt((t) => t + 30000);
          }}
          onSkip={() => setRestEndsAt(null)}
        />
      )}

      {prToast && <PRToast message={prToast} />}

      {detailEx && (
        <ExerciseDetail ex={detailEx} history={logs[slug(detailEx.name)] || []} onClose={() => navigate("/")} />
      )}
    </div>
  );
}

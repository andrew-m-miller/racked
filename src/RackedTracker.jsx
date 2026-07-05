import React, { useState, useEffect, useRef } from "react";
import { PlayCircle, Check, Flame, Dumbbell, TrendingUp, TrendingDown, Minus, RotateCcw, Timer, Trophy, BarChart3, Pencil, Repeat, CloudOff, LogOut } from "lucide-react";
import { loadLogs, addLogEntry, clearAllLogs, loadWeighIns, addWeighIn, loadPlan, savePlan, flushPending, onPendingChange } from "./storage.js";
import { supabase } from "./supabaseClient.js";
import { SEED_DAYS, SEED_META, CAT_COLOR, slug, isTimeBased, isBodyweightEx, exMetric, metricUnit, dayForDate, finisherSlug, localDateKey } from "./planUtils.js";
import { computeSuggestion, targetNumber } from "./progression.js";
import { Sparkline, ExerciseChartModal } from "./charts.jsx";
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

function sessionStats(exercises, logs, today) {
  let volume = 0;
  const levelUps = [];
  for (const ex of exercises) {
    const hist = logs[slug(ex.name)] || [];
    const todayEntries = hist.filter((h) => h.date === today);
    const prior = hist.filter((h) => h.date < today);
    if (!isTimeBased(ex) && !isBodyweightEx(ex)) {
      for (const e of todayEntries) volume += (parseFloat(e.weight) || 0) * (parseFloat(e.reps) || 0);
    }
    const bestToday = todayEntries.reduce((m, e) => Math.max(m, exMetric(ex, e)), 0);
    const bestPrior = prior.reduce((m, e) => Math.max(m, exMetric(ex, e)), 0);
    if (prior.length > 0 && bestToday > bestPrior) levelUps.push(ex.name);
  }
  return { volume: Math.round(volume), levelUps };
}

function TrendIcon({ trend }) {
  if (trend === "up") return <TrendingUp size={13} color="#22C55E" />;
  if (trend === "down") return <TrendingDown size={13} color="#EF4444" />;
  return <Minus size={13} color="#6B7280" />;
}

function RestTimer({ endsAt, onExtend, onSkip }) {
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const done = remaining <= 0;

  useEffect(() => {
    if (!done || firedRef.current) return;
    firedRef.current = true;
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const id = setTimeout(onSkip, 5000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");
  const pillButton = {
    background: "transparent",
    border: "1px solid #2A2E33",
    borderRadius: 6,
    padding: "5px 10px",
    color: "#9AA1AC",
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 16px calc(16px + env(safe-area-inset-bottom))",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: done ? "#14321C" : "#1B1E22",
          border: `1px solid ${done ? "#22C55E" : "#2A2E33"}`,
          borderRadius: 10,
          padding: "10px 14px",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
        }}
      >
        <Timer size={16} color={done ? "#22C55E" : "#9AA1AC"} style={{ flexShrink: 0 }} />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 16,
            fontWeight: 600,
            color: done ? "#22C55E" : "#F5F6F7",
            minWidth: 44,
          }}
        >
          {done ? "GO" : `${mm}:${ss}`}
        </span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9AA1AC", flex: 1 }}>
          {done ? "Rest over — next set" : "Resting"}
        </span>
        {!done && (
          <button type="button" onClick={onExtend} style={pillButton}>
            +30s
          </button>
        )}
        <button type="button" onClick={onSkip} style={pillButton}>
          {done ? "Dismiss" : "Skip"}
        </button>
      </div>
    </div>
  );
}

const EFFORTS = [
  { value: -1, label: "easy", color: "#22C55E" },
  { value: 0, label: "right", color: "#9AA1AC" },
  { value: 1, label: "brutal", color: "#EF4444" },
];

function ExerciseCard({ ex, primary, history, setsDone, onLog, onOpenChart, onSwap }) {
  const complete = setsDone >= ex.sets;
  const timeBased = isTimeBased(ex);
  const showWeightBox = timeBased || !isBodyweightEx(ex);
  const suggestion = computeSuggestion(ex, history);
  const suggestedReps = timeBased ? String(ex.sets) : String(targetNumber(ex.reps) ?? "");
  const [weight, setWeight] = useState(suggestion.value);
  const [reps, setReps] = useState(suggestedReps);
  const [effort, setEffort] = useState(null); // optional: -1 easy · 0 right · 1 brutal
  const [swapOpen, setSwapOpen] = useState(false);
  const swapped = primary && ex.name !== primary.name;

  // Refill the inputs with the up-to-date recommendation whenever a new
  // set gets logged, without overwriting an in-progress edit in between.
  useEffect(() => {
    setWeight(suggestion.value);
    setReps(suggestedReps);
    setEffort(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length]);

  const applySuggestion = () => {
    setWeight(suggestion.value);
    setReps(suggestedReps);
  };

  const submit = () => {
    if (!reps) return;
    onLog(weight, reps, effort);
  };

  return (
    <div
      style={{
        background: "#1B1E22",
        border: "1px solid #2A2E33",
        borderRadius: 10,
        padding: "16px 16px 14px",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15.5, color: "#F5F6F7", lineHeight: 1.25 }}>
            {ex.name}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: CAT_COLOR[ex.cat],
                border: `1px solid ${CAT_COLOR[ex.cat]}55`,
                borderRadius: 4,
                padding: "1px 6px",
              }}
            >
              {ex.cat}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#9AA1AC" }}>
              {ex.sets} × {ex.reps}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {history.length >= 2 && (
            <button
              type="button"
              onClick={onOpenChart}
              aria-label={`Progress chart for ${ex.name}`}
              style={{ background: "transparent", border: "none", padding: "2px 0", cursor: "pointer" }}
            >
              <Sparkline values={history.map((e) => exMetric(ex, e))} color={CAT_COLOR[ex.cat]} />
            </button>
          )}
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12.5,
              color: complete ? "#22C55E" : setsDone > 0 ? "#F5F6F7" : "#3A3F45",
            }}
          >
            {Math.min(setsDone, ex.sets)}/{ex.sets}
          </span>
          {complete && (
            <div style={{ background: "#22C55E22", borderRadius: 999, padding: 4 }}>
              <Check size={14} color="#22C55E" strokeWidth={3} />
            </div>
          )}
        </div>
      </div>

      {/* Suggestion strip */}
      <button
        type="button"
        onClick={applySuggestion}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          marginTop: 10,
          background: "#101214",
          border: "1px solid #2A2E33",
          borderRadius: 6,
          padding: "7px 10px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <TrendIcon trend={suggestion.trend} />
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#E5E7EB", fontWeight: 500 }}>
          {suggestion.text}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#6B7280", marginLeft: "auto" }}>
          {suggestion.detail}
        </span>
      </button>

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        {showWeightBox && (
          <input
            type="text"
            inputMode={timeBased ? "numeric" : "decimal"}
            placeholder={timeBased ? "sec" : "lb"}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            style={{
              width: 62,
              background: "#101214",
              border: "1px solid #2A2E33",
              borderRadius: 6,
              padding: "7px 8px",
              color: "#F5F6F7",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              outline: "none",
            }}
          />
        )}
        <input
          type="text"
          inputMode="numeric"
          placeholder="reps"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          style={{
            width: 62,
            background: "#101214",
            border: "1px solid #2A2E33",
            borderRadius: 6,
            padding: "7px 8px",
            color: "#F5F6F7",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={submit}
          style={{
            flex: 1,
            background: "#F5F6F7",
            color: "#101214",
            border: "none",
            borderRadius: 6,
            padding: "8px 10px",
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Log set
        </button>
        <button
          type="button"
          onClick={() => window.open(ex.url, "_blank", "noopener,noreferrer")}
          style={{ display: "flex", alignItems: "center", color: "#6B7280", padding: 6, background: "transparent", border: "none", cursor: "pointer" }}
          aria-label={`Watch tutorial for ${ex.name}`}
        >
          <PlayCircle size={20} />
        </button>
        {primary && (primary.alts || []).length > 0 && (
          <button
            type="button"
            onClick={() => setSwapOpen(!swapOpen)}
            style={{
              display: "flex",
              alignItems: "center",
              color: swapped ? "#5EC8D8" : "#6B7280",
              padding: 6,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
            aria-label={`Swap ${primary.name} for an alternate`}
            title="Machine taken? Swap it"
          >
            <Repeat size={17} />
          </button>
        )}
      </div>

      {swapOpen && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {[primary, ...(primary.alts || [])].map((opt) => {
            const active = opt.name === ex.name;
            return (
              <button
                key={opt.name}
                type="button"
                onClick={() => {
                  onSwap(opt.name === primary.name ? null : opt.name);
                  setSwapOpen(false);
                }}
                style={{
                  background: active ? "#5EC8D822" : "#101214",
                  border: `1px solid ${active ? "#5EC8D8" : "#2A2E33"}`,
                  borderRadius: 999,
                  color: active ? "#5EC8D8" : "#9AA1AC",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11.5,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                {opt.name}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#6B7280" }}>felt:</span>
        {EFFORTS.map((e) => {
          const active = effort === e.value;
          return (
            <button
              key={e.value}
              type="button"
              onClick={() => setEffort(active ? null : e.value)}
              style={{
                background: active ? `${e.color}22` : "transparent",
                border: `1px solid ${active ? e.color : "#2A2E33"}`,
                borderRadius: 999,
                color: active ? e.color : "#6B7280",
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                padding: "3px 10px",
                cursor: "pointer",
              }}
            >
              {e.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Cardio finisher: display + a log control (minutes, optional machine/mode).
// Entries land in `logs` under the day's finisher slug with reps = minutes.
function FinisherCard({ day, entries, onLog }) {
  const [minutes, setMinutes] = useState("");
  const [mode, setMode] = useState("");
  const done = entries.length > 0;
  const doneMin = entries.reduce((n, e) => n + (parseFloat(e.reps) || 0), 0);

  const submit = () => {
    const min = parseFloat(minutes);
    if (!min || min <= 0) return;
    onLog(min, mode.trim());
    setMinutes("");
    setMode("");
  };

  const inputStyle = {
    background: "#101214",
    border: "1px solid #2A2E33",
    borderRadius: 6,
    padding: "7px 8px",
    color: "#F5F6F7",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    outline: "none",
  };

  return (
    <div
      style={{
        background: "#1B1E22",
        border: `1px solid ${done ? "#22C55E55" : "#2A2E33"}`,
        borderRadius: 10,
        padding: "12px 14px",
        marginTop: 4,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Flame size={17} color="#E8967A" style={{ flexShrink: 0 }} />
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#9AA1AC", flex: 1 }}>
          <strong style={{ color: "#F5F6F7", fontWeight: 600 }}>Finisher — </strong>
          {day.finisher}
        </span>
        {done && (
          <div style={{ background: "#22C55E22", borderRadius: 999, padding: 4, flexShrink: 0 }}>
            <Check size={14} color="#22C55E" strokeWidth={3} />
          </div>
        )}
      </div>

      {done ? (
        <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#22C55E" }}>
          {doneMin} min done{entries[entries.length - 1].note ? ` · ${entries[entries.length - 1].note}` : ""}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="min"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            style={{ ...inputStyle, width: 52 }}
          />
          <input
            type="text"
            placeholder="machine / mode (optional)"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 0, fontFamily: "'Inter', sans-serif" }}
          />
          <button
            onClick={submit}
            style={{
              background: "#F5F6F7",
              color: "#101214",
              border: "none",
              borderRadius: 6,
              padding: "8px 12px",
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Log
          </button>
        </div>
      )}
    </div>
  );
}

export default function RackedTracker({ session }) {
  const [activeDay, setActiveDay] = useState(SEED_DAYS[0].id);
  const [logs, setLogs] = useState({}); // { slug: [{date,weight,reps}, ...] }
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState(null);
  const [view, setView] = useState("workout"); // "workout" | "progress" | "edit" | "onboard"
  const [onboardMode, setOnboardMode] = useState("new"); // "new" first-run · "replace" from the plan editor
  const [days, setDays] = useState(SEED_DAYS); // live plan; Supabase row wins over the bundled seed
  const [planMeta, setPlanMeta] = useState(SEED_META); // goal/daysPerWeek/description for the live plan
  const [swaps, setSwaps] = useState({}); // session-scoped substitutions: { primarySlug: altName }
  const [weighIns, setWeighIns] = useState([]); // [{date, weight}]
  const [chartEx, setChartEx] = useState(null); // exercise shown in the chart modal
  const [prToast, setPrToast] = useState(null);
  const [pendingSync, setPendingSync] = useState(0); // offline writes waiting to upload
  const sessionStartRef = useRef(null); // first set logged in this app session
  const prToastTimerRef = useRef(null);

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
          const liveDays = planData?.days?.length ? planData.days : SEED_DAYS;
          setLogs(logData);
          setWeighIns(weighData);
          setDays(liveDays);
          setPlanMeta(planData?.meta ?? SEED_META);
          setActiveDay(pickInitialDay(liveDays, logData, localDateKey()));
          const isNewUser = planData === null && Object.keys(logData).length === 0;
          if (isNewUser) {
            setOnboardMode("new");
            setView("onboard");
          }
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
      clearTimeout(prToastTimerRef.current);
    };
  }, []);

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
    // Update optimistically so the UI feels instant; a functional updater keeps
    // concurrent writes from clobbering each other, and rollback drops just this
    // entry (by reference) so an in-flight sibling write survives a failure here.
    setLogs((prev) => ({ ...prev, [key]: [...(prev[key] || []), entry] }));
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
    addLogEntry(key, today, weight, reps, effort ?? null)
      .then(() => setSaveError(false))
      .catch(() => {
        setLogs((prev) => ({ ...prev, [key]: (prev[key] || []).filter((x) => x !== entry) }));
        setSaveError(true);
      });
  };

  const handleLogFinisher = (minutes, mode) => {
    const key = finisherSlug(day.id);
    const entry = { date: today, weight: "", reps: String(minutes), effort: null, note: mode || null };
    setLogs((prev) => ({ ...prev, [key]: [...(prev[key] || []), entry] }));
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();
    addLogEntry(key, today, "", String(minutes), null, mode || null)
      .then(() => setSaveError(false))
      .catch(() => {
        setLogs((prev) => ({ ...prev, [key]: (prev[key] || []).filter((x) => x !== entry) }));
        setSaveError(true);
      });
  };

  const handleSavePlan = async (nextDays, nextMeta = planMeta) => {
    try {
      await savePlan({ meta: nextMeta, days: nextDays });
      setDays(nextDays);
      setPlanMeta(nextMeta);
      setSwaps({});
      // The edited plan may have dropped the day that was open.
      if (!nextDays.some((d) => d.id === activeDay)) setActiveDay(nextDays[0]?.id);
      setSaveError(false);
    } catch (err) {
      setSaveError(true);
      throw err;
    }
  };

  // Apply a coach-suggested tweak ({exercise, sets, reps}, nulls = unchanged)
  // to the live plan. Matches by slug across all days, primaries only.
  const handleApplyPlanChange = (change) => {
    const key = slug(change.exercise);
    const nextDays = days.map((d) => ({
      ...d,
      exercises: d.exercises.map((ex) =>
        slug(ex.name) === key
          ? {
              ...ex,
              ...(change.sets != null ? { sets: Number(change.sets) } : {}),
              ...(change.reps != null ? { reps: String(change.reps) } : {}),
            }
          : ex
      ),
    }));
    return handleSavePlan(nextDays);
  };

  const handleWeighIn = (weightLb) => {
    const entry = { date: today, weight: String(weightLb) };
    setWeighIns((prev) => [...prev, entry].sort((a, b) => (a.date < b.date ? -1 : 1)));
    addWeighIn(today, weightLb)
      .then(() => setSaveError(false))
      .catch(() => {
        setWeighIns((prev) => prev.filter((x) => x !== entry));
        setSaveError(true);
      });
  };

  const resetAll = () => {
    if (!window.confirm || window.confirm("Clear all logged history? This can't be undone.")) {
      const previousLogs = logs;
      setLogs({});
      setRestEndsAt(null);
      sessionStartRef.current = null;
      clearAllLogs()
        .then(() => setSaveError(false))
        .catch(() => {
          setLogs(previousLogs);
          setSaveError(true);
        });
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
              onClick={() => setView(view === "workout" ? "progress" : "workout")}
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
              onClick={() => setView(view === "edit" ? "workout" : "edit")}
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

        {view === "progress" && (
          <ProgressView
            days={days}
            logs={logs}
            weighIns={weighIns}
            today={today}
            meta={planMeta}
            onAddWeighIn={handleWeighIn}
            onApplyPlanChange={handleApplyPlanChange}
          />
        )}

        {view === "edit" && (
          <PlanEditor
            days={days}
            meta={planMeta}
            onSave={handleSavePlan}
            onClose={() => setView("workout")}
            onDesign={() => {
              setOnboardMode("replace");
              setView("onboard");
            }}
          />
        )}

        {view === "onboard" && (
          <Onboarding
            mode={onboardMode}
            onAccept={async ({ meta, days: nextDays }) => {
              await handleSavePlan(nextDays, meta);
              setActiveDay(nextDays[0]?.id);
              setView("workout");
            }}
            onSkip={() => {
              // Save the seed as this user's plan so onboarding is offered once;
              // a failed save just means they see it again next visit.
              handleSavePlan(SEED_DAYS, SEED_META).catch(() => {});
              setView("workout");
            }}
            onCancel={() => setView("edit")}
          />
        )}

        {view === "workout" && (
        <>
        {/* Day selector */}
        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          {days.map((d) => {
            const active = d.id === activeDay;
            return (
              <button
                key={d.id}
                onClick={() => setActiveDay(d.id)}
                style={{
                  flex: 1,
                  background: active ? "#1B1E22" : "transparent",
                  border: `2px solid ${active ? d.plate : "#2A2E33"}`,
                  borderRadius: 10,
                  padding: "8px 2px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    border: `4px solid ${d.plate}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                    fontSize: 11,
                    color: active ? "#F5F6F7" : "#6B7280",
                  }}
                >
                  {d.id}
                </div>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: active ? "#F5F6F7" : "#6B7280", fontWeight: 500 }}>
                  {d.label}
                </span>
              </button>
            );
          })}
        </div>

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
          <div
            style={{
              border: `2px solid ${day.plate}`,
              background: "#1B1E22",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Trophy size={16} color={day.plate} />
              <span
                style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: 600,
                  fontSize: 15,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  color: "#F5F6F7",
                }}
              >
                Workout complete
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 8,
                flexWrap: "wrap",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12.5,
                color: "#9AA1AC",
              }}
            >
              <span>{stats.volume.toLocaleString()} lb lifted</span>
              {cardioMin > 0 && <span>{cardioMin} min cardio</span>}
              {durationMin != null && <span>{durationMin} min total</span>}
              <span>{totalSets} sets</span>
            </div>
            {stats.levelUps.length > 0 && (
              <div style={{ marginTop: 6, fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#22C55E" }}>
                Leveled up: {stats.levelUps.join(", ")}
              </div>
            )}
          </div>
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
              onOpenChart={() => setChartEx(ex)}
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
          onExtend={() => setRestEndsAt((t) => t + 30000)}
          onSkip={() => setRestEndsAt(null)}
        />
      )}

      {prToast && (
        <div
          style={{
            position: "fixed",
            top: "calc(14px + env(safe-area-inset-top))",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            padding: "0 16px",
            pointerEvents: "none",
            zIndex: 30,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#1B1E22",
              border: "1px solid #FACC15",
              borderRadius: 999,
              padding: "8px 16px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
            }}
          >
            <Trophy size={14} color="#FACC15" />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: "#F5F6F7" }}>
              {prToast}
            </span>
          </div>
        </div>
      )}

      {chartEx && (
        <ExerciseChartModal ex={chartEx} history={logs[slug(chartEx.name)] || []} onClose={() => setChartEx(null)} />
      )}
    </div>
  );
}

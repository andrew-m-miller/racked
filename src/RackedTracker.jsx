import React, { useState, useEffect } from "react";
import { PlayCircle, Check, Flame, Dumbbell, TrendingUp, TrendingDown, Minus, RotateCcw } from "lucide-react";
import { loadLogs, addLogEntry, clearAllLogs } from "./storage.js";
import plan from "../exercises.json";

const DAYS = plan.days;
const CAT_COLOR = { Upper: "#5EC8D8", Lower: "#E8967A", Core: "#B9A6E0" };

// ---- Progression helpers ----
function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// pull the top-of-range target number out of a reps string like "12", "10/leg", "30-45 sec"
function targetNumber(repsStr) {
  const nums = (repsStr.match(/\d+/g) || []).map(Number);
  return nums.length ? nums[nums.length - 1] : null;
}

// pull a usable numeric baseline out of a start-weight string like "30–35 lb DB"
function startNumber(startStr) {
  const nums = (startStr.match(/\d+(\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  return Math.round(((nums[0] + nums[1]) / 2) / 2.5) * 2.5;
}

const INCREMENT = { Upper: 5, Lower: 10, Core: 5 }; // lb, lb, seconds

// Holds (Plank, Side Plank) log seconds in the `weight` field and reps in
// the `reps` field; other bodyweight moves (e.g. Hanging Knee Raise) just log reps.
function isTimeBased(ex) {
  return /sec/i.test(ex.reps);
}

function isBodyweightEx(ex) {
  return ex.start === "Bodyweight";
}

function computeSuggestion(ex, history) {
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

  // consecutive misses, most recent first
  let missStreak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const v = timeBased ? parseFloat(history[i].weight) || 0 : parseFloat(history[i].reps) || 0;
    const t = target || 0;
    if (v < t) missStreak++;
    else break;
  }

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

  if (missStreak >= 2) {
    const deload = Math.round((lastWeight * 0.9) / 2.5) * 2.5;
    return {
      text: `Deload to ${deload} lb`,
      value: String(deload),
      trend: "down",
      detail: `Missed target ${missStreak} sessions in a row`,
    };
  }

  if (hitTarget) {
    const next = lastWeight + inc;
    return {
      text: `Try ${next} lb`,
      value: String(next),
      trend: "up",
      detail: `Last: ${lastWeight} lb × ${last.reps} — hit target`,
    };
  }

  return {
    text: `Hold at ${lastWeight} lb`,
    value: String(lastWeight),
    trend: "flat",
    detail: `Last: ${lastWeight} lb × ${last.reps} — under target`,
  };
}

function TrendIcon({ trend }) {
  if (trend === "up") return <TrendingUp size={13} color="#22C55E" />;
  if (trend === "down") return <TrendingDown size={13} color="#EF4444" />;
  return <Minus size={13} color="#6B7280" />;
}

function ExerciseCard({ ex, history, todayLogged, onLog }) {
  const timeBased = isTimeBased(ex);
  const showWeightBox = timeBased || !isBodyweightEx(ex);
  const suggestion = computeSuggestion(ex, history);
  const suggestedReps = timeBased ? String(ex.sets) : String(targetNumber(ex.reps) ?? "");
  const [weight, setWeight] = useState(suggestion.value);
  const [reps, setReps] = useState(suggestedReps);

  // Refill the inputs with the up-to-date recommendation whenever a new
  // set gets logged, without overwriting an in-progress edit in between.
  useEffect(() => {
    setWeight(suggestion.value);
    setReps(suggestedReps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length]);

  const applySuggestion = () => {
    setWeight(suggestion.value);
    setReps(suggestedReps);
  };

  const submit = () => {
    if (!reps) return;
    onLog(weight, reps);
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
        {todayLogged && (
          <div style={{ background: "#22C55E22", borderRadius: 999, padding: 4, flexShrink: 0 }}>
            <Check size={14} color="#22C55E" strokeWidth={3} />
          </div>
        )}
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
      </div>
    </div>
  );
}

export default function RackedTracker() {
  const [activeDay, setActiveDay] = useState("A");
  const [logs, setLogs] = useState({}); // { slug: [{date,weight,reps}, ...] }
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLogs()
      .then((data) => {
        if (!cancelled) setLogs(data);
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

  const day = DAYS.find((d) => d.id === activeDay);
  const today = new Date().toISOString().slice(0, 10);

  const handleLog = (exName, weight, reps) => {
    const key = slug(exName);
    const history = logs[key] || [];
    const previousLogs = logs;
    // Update optimistically so the UI feels instant; roll back if the insert fails.
    setLogs({ ...logs, [key]: [...history, { date: today, weight, reps }] });
    addLogEntry(key, today, weight, reps)
      .then(() => setSaveError(false))
      .catch(() => {
        setLogs(previousLogs);
        setSaveError(true);
      });
  };

  const resetAll = () => {
    if (!window.confirm || window.confirm("Clear all logged history? This can't be undone.")) {
      const previousLogs = logs;
      setLogs({});
      clearAllLogs()
        .then(() => setSaveError(false))
        .catch(() => {
          setLogs(previousLogs);
          setSaveError(true);
        });
    }
  };

  const loggedTodayCount = day.exercises.filter((ex) => {
    const hist = logs[slug(ex.name)] || [];
    return hist.some((h) => h.date === today);
  }).length;

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: "#101214", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#6B7280", fontSize: 13 }}>Loading your log…</span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#101214", padding: "28px 16px 60px", display: "flex", justifyContent: "center" }}>
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
          <button
            type="button"
            onClick={resetAll}
            title="Clear all history"
            style={{ background: "transparent", border: "none", color: "#3A3F45", cursor: "pointer", padding: 4 }}
          >
            <RotateCcw size={16} />
          </button>
        </div>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6B7280", margin: "0 0 14px" }}>
          3-day full body · your gym, your numbers
        </p>

        {saveError && (
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
        )}

        {/* Day selector */}
        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          {DAYS.map((d) => {
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
                  padding: "10px 6px",
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
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: active ? "#F5F6F7" : "#6B7280", fontWeight: 500 }}>
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
            {loggedTodayCount}/{day.exercises.length} today
          </span>
        </div>

        <div style={{ height: 3, background: "#1B1E22", borderRadius: 2, marginBottom: 18, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${(loggedTodayCount / day.exercises.length) * 100}%`,
              background: day.plate,
              transition: "width 200ms ease",
            }}
          />
        </div>

        {/* Exercise list */}
        {day.exercises.map((ex) => {
          const key = slug(ex.name);
          const history = logs[key] || [];
          const todayLogged = history.some((h) => h.date === today);
          return (
            <ExerciseCard
              key={key}
              ex={ex}
              history={history}
              todayLogged={todayLogged}
              onLog={(w, r) => handleLog(ex.name, w, r)}
            />
          );
        })}

        {/* Finisher */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: "#1B1E22",
            border: "1px solid #2A2E33",
            borderRadius: 10,
            padding: "12px 14px",
            marginTop: 4,
          }}
        >
          <Flame size={17} color="#E8967A" style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#9AA1AC" }}>
            <strong style={{ color: "#F5F6F7", fontWeight: 600 }}>Finisher — </strong>
            {day.finisher}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            justifyContent: "center",
            marginTop: 24,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: "#3A3F45",
          }}
        >
          logs synced to your account
        </div>
      </div>
    </div>
  );
}

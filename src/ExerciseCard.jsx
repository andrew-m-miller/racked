import React, { useState, useEffect } from "react";
import { PlayCircle, Check, TrendingUp, TrendingDown, Minus, Repeat, BarChart3 } from "lucide-react";
import { CAT_COLOR, isTimeBased, isBodyweightEx, exMetric } from "./planUtils.js";
import { computeSuggestion, targetNumber } from "./progression.js";
import { Sparkline } from "./charts.jsx";

function TrendIcon({ trend }) {
  if (trend === "up") return <TrendingUp size={13} color="#22C55E" />;
  if (trend === "down") return <TrendingDown size={13} color="#EF4444" />;
  return <Minus size={13} color="#6B7280" />;
}

const EFFORTS = [
  { value: -1, label: "easy", color: "#22C55E" },
  { value: 0, label: "right", color: "#9AA1AC" },
  { value: 1, label: "brutal", color: "#EF4444" },
];

// `cycle` (meta.cycle, may be undefined) + `date` (the session date being
// logged) make the suggestion strip mesocycle-aware — Phase 15.
export default function ExerciseCard({ ex, primary, history, setsDone, onLog, onOpenChart, onSwap, cycle, date }) {
  const complete = setsDone >= ex.sets;
  const timeBased = isTimeBased(ex);
  const showWeightBox = timeBased || !isBodyweightEx(ex);
  const suggestion = computeSuggestion(ex, history, { cycle, date });
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
          {/* Detail-view entry point: the sparkline once there's a trend to
              draw, a plain chart icon for a single logged set — without it,
              a one-set history would be unreachable (and uneditable). */}
          {history.length >= 1 && (
            <button
              type="button"
              onClick={onOpenChart}
              aria-label={`Progress chart for ${ex.name}`}
              style={{ background: "transparent", border: "none", padding: "2px 0", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              {history.length >= 2 ? (
                <Sparkline values={history.map((e) => exMetric(ex, e))} color={CAT_COLOR[ex.cat]} />
              ) : (
                <BarChart3 size={16} color="#6B7280" />
              )}
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

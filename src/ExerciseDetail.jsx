import React, { useState } from "react";
import { Check, ChevronLeft, Pencil, Trash2, Trophy } from "lucide-react";
import { CAT_COLOR, exMetric, metricUnit, isTimeBased, isBodyweightEx } from "./planUtils.js";
import { fmtSets } from "./recap.js";
import { isWeighted, e1rmSeries, e1rmStats, sessionsByDate } from "./insights.js";
import { StatBlock } from "./ui.jsx";
import { LineChart } from "./charts.jsx";

function shortDate(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function longDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const EFFORTS = [
  { value: null, label: "unrated", color: "#6B7280" },
  { value: -1, label: "easy", color: "#22C55E" },
  { value: 0, label: "right", color: "#9AA1AC" },
  { value: 1, label: "brutal", color: "#EF4444" },
];

const editInputStyle = {
  width: 52,
  background: "#101214",
  border: "1px solid #2A2E33",
  borderRadius: 6,
  padding: "5px 7px",
  color: "#F5F6F7",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12.5,
  outline: "none",
};

const editIconBtn = {
  display: "flex",
  alignItems: "center",
  background: "transparent",
  border: "1px solid #2A2E33",
  borderRadius: 6,
  cursor: "pointer",
  padding: 5,
};

// One set in edit mode: weight/reps inputs (seconds live in `weight` for
// timed holds, rep-only bodyweight moves get no weight box — same rules as
// ExerciseCard), an effort cycler, save-on-change, and delete.
function SetEditor({ ex, set, onSave, onDelete }) {
  const [weight, setWeight] = useState(set.weight);
  const [reps, setReps] = useState(set.reps);
  const [effort, setEffort] = useState(set.effort ?? null);
  const timeBased = isTimeBased(ex);
  const showWeight = timeBased || !isBodyweightEx(ex);
  const dirty = weight !== set.weight || reps !== set.reps || effort !== (set.effort ?? null);
  const effortIdx = EFFORTS.findIndex((e) => e.value === effort);
  const effortOpt = EFFORTS[effortIdx < 0 ? 0 : effortIdx];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {showWeight && (
        <input
          type="text"
          inputMode={timeBased ? "numeric" : "decimal"}
          placeholder={timeBased ? "sec" : "lb"}
          aria-label="Set weight"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          style={editInputStyle}
        />
      )}
      <input
        type="text"
        inputMode="numeric"
        placeholder="reps"
        aria-label="Set reps"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        style={editInputStyle}
      />
      <button
        type="button"
        onClick={() => setEffort(EFFORTS[(effortIdx < 0 ? 1 : effortIdx + 1) % EFFORTS.length].value)}
        title="Cycle perceived effort"
        style={{
          background: "transparent",
          border: `1px solid ${effort == null ? "#2A2E33" : effortOpt.color}`,
          borderRadius: 999,
          color: effortOpt.color,
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          padding: "3px 10px",
          cursor: "pointer",
        }}
      >
        {effortOpt.label}
      </button>
      <button
        type="button"
        onClick={() => onSave({ weight, reps, effort, note: set.note ?? null })}
        disabled={!dirty}
        aria-label="Save set"
        style={{ ...editIconBtn, marginLeft: "auto", opacity: dirty ? 1 : 0.35 }}
      >
        <Check size={14} color="#22C55E" />
      </button>
      <button
        type="button"
        onClick={() => {
          if (!window.confirm || window.confirm("Delete this set? This can't be undone.")) onDelete();
        }}
        aria-label="Delete set"
        style={editIconBtn}
      >
        <Trash2 size={14} color="#E8967A" />
      </button>
    </div>
  );
}

// Full-history drill-down for one exercise, opened from a card's sparkline.
// Works for primaries and swapped-in alternates alike — each logs under its
// own slug, so `history` is already that movement's own record. When
// onUpdateSet/onDeleteSet are wired (Phase 12), each session can flip into
// edit mode to fix or remove individual sets — but only sets with an id
// (pre-Phase-12 offline snapshots have none, so those stay read-only).
export default function ExerciseDetail({ ex, history, onClose, onUpdateSet, onDeleteSet }) {
  const [editDate, setEditDate] = useState(null); // one session in edit mode at a time
  const values = history.map((e) => exMetric(ex, e));
  const unit = metricUnit(ex);
  const color = CAT_COLOR[ex.cat];
  // Deep links (#/exercise/<slug>) can open a never-logged exercise, where
  // Math.max() over nothing would render "-Infinity".
  const best = values.length ? Math.max(...values) : null;
  const prIndex = best == null ? -1 : values.lastIndexOf(best);
  const prEntry = prIndex >= 0 ? history[prIndex] : undefined;

  const weighted = isWeighted(ex);
  const e1rm = weighted ? e1rmStats(ex, history) : null;
  const e1rmValues = weighted ? e1rmSeries(ex, history) : null;

  const sessions = sessionsByDate(history);

  const series = [{ values, color, dots: true, trendDots: true, prIndex }];
  if (e1rmValues && e1rmValues.length >= 2) {
    series.push({ values: e1rmValues, color: "#9AA1AC", dashed: true });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#101214",
        zIndex: 20,
        overflowY: "auto",
        padding: "calc(20px + env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom))",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, height: "fit-content" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to workout"
            style={{
              display: "flex",
              alignItems: "center",
              background: "transparent",
              border: "1px solid #2A2E33",
              borderRadius: 8,
              color: "#9AA1AC",
              cursor: "pointer",
              padding: "6px 8px",
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 17, color: "#F5F6F7", lineHeight: 1.2 }}>
              {ex.name}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color,
                  border: `1px solid ${color}55`,
                  borderRadius: 4,
                  padding: "1px 6px",
                }}
              >
                {ex.cat}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "#6B7280" }}>
                {history.length} sets · {sessions.length} sessions
              </span>
            </div>
          </div>
        </div>

        {/* Headline stats */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <StatBlock
            label={`all-time best (${unit})`}
            value={best ?? "—"}
            sub={prEntry ? longDate(prEntry.date) : undefined}
            accent="#FACC15"
          />
          {e1rm && (
            <StatBlock
              label="est. 1RM (lb)"
              value={Math.round(e1rm.current)}
              sub={
                e1rm.delta30 == null
                  ? "≈30-day change: —"
                  : `≈30-day change: ${e1rm.delta30 > 0 ? "+" : ""}${Math.round(e1rm.delta30 * 10) / 10}`
              }
              accent={e1rm.delta30 == null ? undefined : e1rm.delta30 >= 0 ? "#22C55E" : "#E8967A"}
            />
          )}
        </div>

        {/* Chart: every set's metric, green/red dots on level-ups/drop-offs
            (deloads), gold ring on the all-time PR, dashed e1RM overlay. */}
        {values.length >= 2 ? (
          <div style={{ background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 12px 8px" }}>
            <LineChart
              series={series}
              labels={[shortDate(history[0].date), shortDate(history[history.length - 1].date)]}
              unit={series.length > 1 ? `${unit} · e1RM dashed` : unit}
              height={170}
            />
          </div>
        ) : (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6B7280", padding: "16px 0" }}>
            Log a couple of sessions and the trend shows up here.
          </div>
        )}

        {/* Per-session history, newest first */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "20px 0 8px" }}>
          <h2
            style={{
              fontFamily: "'Oswald', sans-serif",
              fontWeight: 600,
              fontSize: 15,
              color: "#F5F6F7",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.02em",
            }}
          >
            Sessions
          </h2>
        </div>
        {sessions.length === 0 ? (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#6B7280" }}>No sets logged yet.</div>
        ) : (
        <div style={{ background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10 }}>
          {[...sessions].reverse().map(({ date, sets }, i) => {
            const hasPr = prEntry && date === prEntry.date && sets.includes(prEntry);
            const editable = onUpdateSet && onDeleteSet && sets.every((s) => s.id != null);
            const editing = editable && editDate === date;
            return (
              <div
                key={date}
                style={{
                  display: "flex",
                  alignItems: editing ? "flex-start" : "baseline",
                  gap: 10,
                  padding: "9px 14px",
                  borderTop: i === 0 ? "none" : "1px solid #2A2E33",
                }}
              >
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "#6B7280", flexShrink: 0, width: 86 }}>
                  {longDate(date)}
                </span>
                {editing ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    {sets.map((set) => (
                      <SetEditor
                        key={set.id}
                        ex={ex}
                        set={set}
                        onSave={(fields) => onUpdateSet(set.id, fields)}
                        onDelete={() => onDeleteSet(set.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#F5F6F7", flex: 1 }}>
                    {fmtSets(ex, sets)}
                  </span>
                )}
                {hasPr && !editing && <Trophy size={12} color="#FACC15" style={{ flexShrink: 0, alignSelf: "center" }} />}
                {editable && (
                  <button
                    type="button"
                    onClick={() => setEditDate(editing ? null : date)}
                    aria-label={editing ? `Done editing ${longDate(date)}` : `Edit sets from ${longDate(date)}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      alignSelf: editing ? "flex-start" : "center",
                      flexShrink: 0,
                      background: "transparent",
                      border: "none",
                      color: editing ? "#5EC8D8" : "#3A3F45",
                      cursor: "pointer",
                      padding: 3,
                    }}
                  >
                    {editing ? <Check size={14} /> : <Pencil size={13} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}

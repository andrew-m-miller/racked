import React, { useState } from "react";
import { ChevronUp, ChevronDown, Trash2, Plus, Check, Sparkles, RefreshCw } from "lucide-react";
import { CAT_COLOR, PLATE_COLORS, MAX_DAYS, localDateKey } from "./planUtils.js";
import { normalizeCycle, cycleWeekKey, MIN_BLOCK_WEEKS, MAX_BLOCK_WEEKS } from "./cycleUtils.js";

const CATS = ["Upper", "Lower", "Core"];

const inputStyle = {
  background: "#101214",
  border: "1px solid #2A2E33",
  borderRadius: 6,
  padding: "7px 8px",
  color: "#F5F6F7",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12.5,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 10.5,
  color: "#6B7280",
  display: "block",
  marginBottom: 3,
};

const iconButton = {
  background: "transparent",
  border: "1px solid #2A2E33",
  borderRadius: 6,
  color: "#9AA1AC",
  cursor: "pointer",
  padding: "4px 6px",
  display: "flex",
  alignItems: "center",
};

function Field({ label, value, onChange, width, inputMode }) {
  return (
    <div style={{ width: width || "auto", flex: width ? "none" : 1 }}>
      <label style={labelStyle}>{label}</label>
      <input type="text" inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

function ExerciseEditor({ ex, index, count, onChange, onMove, onRemove }) {
  return (
    <div style={{ background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 12px 10px", marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
        <Field label="Exercise" value={ex.name} onChange={(v) => onChange({ ...ex, name: v })} />
        <button type="button" style={{ ...iconButton, opacity: index === 0 ? 0.3 : 1 }} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          style={{ ...iconButton, opacity: index === count - 1 ? 0.3 : 1 }}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          aria-label="Move down"
        >
          <ChevronDown size={14} />
        </button>
        <button type="button" style={{ ...iconButton, color: "#EF4444", borderColor: "#EF444455" }} onClick={onRemove} aria-label="Remove exercise">
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 130 }}>
          <span style={labelStyle}>Category</span>
          <div style={{ display: "flex", gap: 4 }}>
            {CATS.map((c) => {
              const active = ex.cat === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange({ ...ex, cat: c })}
                  style={{
                    background: active ? `${CAT_COLOR[c]}22` : "transparent",
                    border: `1px solid ${active ? CAT_COLOR[c] : "#2A2E33"}`,
                    borderRadius: 5,
                    color: active ? CAT_COLOR[c] : "#6B7280",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    padding: "5px 6px",
                    cursor: "pointer",
                  }}
                >
                  {c[0]}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Sets" value={String(ex.sets)} onChange={(v) => onChange({ ...ex, sets: v })} width={54} inputMode="numeric" />
        <Field label="Reps / time" value={ex.reps} onChange={(v) => onChange({ ...ex, reps: v })} />
        <Field label="Start" value={ex.start} onChange={(v) => onChange({ ...ex, start: v })} />
      </div>

      <Field label="Tutorial URL" value={ex.url} onChange={(v) => onChange({ ...ex, url: v })} />
    </div>
  );
}

export default function PlanEditor({ days, meta, onSave, onClose, onDesign }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(days)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Mesocycle (Phase 15): the block editor keeps one deload week as a plain
  // field; the saved shape is meta.cycle = {lengthWeeks, deloadWeeks: [n],
  // startDate}. Defaults for first-time enabling: a 4-week block starting
  // this Monday with week 4 as the deload.
  const [cycle, setCycle] = useState(() => {
    const c = normalizeCycle(meta?.cycle);
    return {
      on: !!c,
      lengthWeeks: String(c?.lengthWeeks ?? 4),
      deloadWeek: String(c ? c.deloadWeeks[c.deloadWeeks.length - 1] : 4),
      startDate: c?.startDate ?? cycleWeekKey(localDateKey()),
    };
  });
  const draftCycle = cycle.on
    ? normalizeCycle({ lengthWeeks: Number(cycle.lengthWeeks), deloadWeeks: [Number(cycle.deloadWeek)], startDate: cycle.startDate })
    : null;

  const setDay = (di, day) => setDraft(draft.map((d, i) => (i === di ? day : d)));
  const setEx = (di, ei, ex) => setDay(di, { ...draft[di], exercises: draft[di].exercises.map((e, i) => (i === ei ? ex : e)) });
  const moveEx = (di, ei, dir) => {
    const list = [...draft[di].exercises];
    const [item] = list.splice(ei, 1);
    list.splice(ei + dir, 0, item);
    setDay(di, { ...draft[di], exercises: list });
  };
  const removeEx = (di, ei) => setDay(di, { ...draft[di], exercises: draft[di].exercises.filter((_, i) => i !== ei) });
  const addEx = (di) =>
    setDay(di, {
      ...draft[di],
      exercises: [
        ...draft[di].exercises,
        { name: "New Exercise", cat: "Upper", sets: 3, reps: "12", start: "20–30 lb", url: "https://www.youtube.com/results?search_query=exercise+form" },
      ],
    });

  // Day ids are letters assigned once and never renumbered, so finisher-a/-b/...
  // history keeps resolving even after days are removed and re-added.
  const addDay = () => {
    if (draft.length >= MAX_DAYS) return;
    const id = [..."ABCDE"].find((letter) => !draft.some((d) => d.id === letter));
    setDraft([
      ...draft,
      {
        id,
        label: `Day ${draft.length + 1}`,
        name: `Day ${draft.length + 1}`,
        plate: PLATE_COLORS.find((p) => !draft.some((d) => d.plate === p)) ?? PLATE_COLORS[draft.length],
        finisher: "10–15 min cardio of your choice",
        exercises: [
          { name: "New Exercise", cat: "Upper", sets: 3, reps: "12", start: "20–30 lb", url: "https://www.youtube.com/results?search_query=exercise+form" },
        ],
      },
    ]);
  };

  const removeDay = (di) => {
    if (draft.length <= 1) return;
    if (window.confirm && !window.confirm(`Remove ${draft[di].name}? Its exercises' history is kept.`)) return;
    setDraft(draft.filter((_, i) => i !== di));
  };

  const valid =
    draft.every((d) => d.exercises.length > 0 && d.exercises.every((e) => e.name.trim() && Number(e.sets) >= 1)) &&
    (!cycle.on || !!draftCycle);

  const save = async () => {
    if (!valid || saving) return;
    // Normalize sets back to numbers and relabel days by position; everything
    // else stays as typed. A day-count change follows through to meta so the
    // streak target tracks the plan (description is left as-is — cosmetic).
    const cleaned = draft.map((d, i) => ({
      ...d,
      label: `Day ${i + 1}`,
      exercises: d.exercises.map((e) => ({ ...e, sets: Number(e.sets), name: e.name.trim() })),
    }));
    let nextMeta = cleaned.length !== meta?.daysPerWeek ? { ...meta, daysPerWeek: cleaned.length } : meta;
    // Cycle edits follow through to meta; an untouched cycle leaves meta as-is.
    if (cycle.on && JSON.stringify(draftCycle) !== JSON.stringify(normalizeCycle(meta?.cycle))) {
      nextMeta = { ...nextMeta, cycle: draftCycle };
    } else if (!cycle.on && meta?.cycle) {
      nextMeta = { ...nextMeta };
      delete nextMeta.cycle;
    }
    setSaving(true);
    try {
      await onSave(cleaned, nextMeta);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // parent surfaces the save-error banner
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
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
          Edit plan
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid #2A2E33",
              borderRadius: 6,
              color: "#9AA1AC",
              fontFamily: "'Inter', sans-serif",
              fontSize: 12.5,
              fontWeight: 500,
              padding: "7px 12px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!valid || saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: saved ? "#22C55E" : "#F5F6F7",
              color: "#101214",
              border: "none",
              borderRadius: 6,
              fontFamily: "'Inter', sans-serif",
              fontSize: 12.5,
              fontWeight: 600,
              padding: "7px 14px",
              cursor: valid && !saving ? "pointer" : "default",
              opacity: valid ? 1 : 0.5,
            }}
          >
            {saved && <Check size={13} strokeWidth={3} />}
            {saved ? "Saved" : saving ? "Saving…" : "Save plan"}
          </button>
        </div>
      </div>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#6B7280", margin: "0 0 16px" }}>
        Changes save to the cloud and apply everywhere — no deploy needed. Progression history follows the exercise name.
      </p>

      {/* AI plan designer entry point — same flow as onboarding, replace mode */}
      <button
        type="button"
        onClick={onDesign}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          background: "#1B1E22",
          border: "1px solid #B9A6E0",
          borderRadius: 8,
          color: "#B9A6E0",
          padding: "10px 12px",
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        <Sparkles size={14} />
        Design a new plan with AI
      </button>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#6B7280", margin: "6px 0 18px", textAlign: "center" }}>
        Replaces your current plan — history is kept.
      </p>

      {/* Mesocycle (Phase 15): repeating blocks with a planned deload week */}
      <div style={{ background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 12px 10px", marginBottom: 22 }}>
        <button
          type="button"
          onClick={() => setCycle({ ...cycle, on: !cycle.on })}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", padding: 0, cursor: "pointer", width: "100%" }}
        >
          <span
            style={{
              width: 15,
              height: 15,
              borderRadius: 4,
              border: cycle.on ? "1px solid #B9A6E0" : "1px solid #3A3F46",
              background: cycle.on ? "#221B2E" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {cycle.on && <Check size={11} color="#B9A6E0" />}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: "#F5F6F7" }}>
            <RefreshCw size={13} color="#B9A6E0" />
            Train in blocks (mesocycle)
          </span>
        </button>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#6B7280", margin: "6px 0 0 23px" }}>
          Repeats a fixed-length block; the deload week suggests ~90% loads and never counts toward the automatic deload.
        </p>
        {cycle.on && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, marginLeft: 23, flexWrap: "wrap" }}>
            <Field
              label={`Block length (${MIN_BLOCK_WEEKS}–${MAX_BLOCK_WEEKS} wks)`}
              value={cycle.lengthWeeks}
              onChange={(v) => setCycle({ ...cycle, lengthWeeks: v })}
              width={110}
              inputMode="numeric"
            />
            <Field
              label="Deload on week"
              value={cycle.deloadWeek}
              onChange={(v) => setCycle({ ...cycle, deloadWeek: v })}
              width={100}
              inputMode="numeric"
            />
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Block started (Mon)</label>
              <input
                type="date"
                value={cycle.startDate}
                onChange={(e) => setCycle({ ...cycle, startDate: e.target.value })}
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            </div>
          </div>
        )}
        {cycle.on && !draftCycle && (
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#F5B4B4", margin: "8px 0 0 23px" }}>
            Check the block settings — length {MIN_BLOCK_WEEKS}–{MAX_BLOCK_WEEKS} weeks, the deload week inside the block, and a start date.
          </p>
        )}
      </div>

      {draft.map((day, di) => (
        <div key={day.id} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: day.plate, display: "inline-block", flexShrink: 0, marginBottom: 9 }} />
            <Field label={day.label} value={day.name} onChange={(v) => setDay(di, { ...day, name: v })} />
            <button
              type="button"
              style={{ ...iconButton, color: "#EF4444", borderColor: "#EF444455", opacity: draft.length === 1 ? 0.3 : 1, marginBottom: 1 }}
              disabled={draft.length === 1}
              onClick={() => removeDay(di)}
              aria-label={`Remove ${day.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>

          {day.exercises.map((ex, ei) => (
            <ExerciseEditor
              key={ei}
              ex={ex}
              index={ei}
              count={day.exercises.length}
              onChange={(next) => setEx(di, ei, next)}
              onMove={(dir) => moveEx(di, ei, dir)}
              onRemove={() => removeEx(di, ei)}
            />
          ))}

          <button
            type="button"
            onClick={() => addEx(di)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              justifyContent: "center",
              background: "transparent",
              border: "1px dashed #2A2E33",
              borderRadius: 10,
              color: "#9AA1AC",
              fontFamily: "'Inter', sans-serif",
              fontSize: 12.5,
              padding: "9px 0",
              cursor: "pointer",
              marginBottom: 6,
            }}
          >
            <Plus size={14} /> Add exercise
          </button>

          <div style={{ marginTop: 4 }}>
            <Field label="Finisher" value={day.finisher} onChange={(v) => setDay(di, { ...day, finisher: v })} />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addDay}
        disabled={draft.length >= MAX_DAYS}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          justifyContent: "center",
          background: "transparent",
          border: "1px dashed #2A2E33",
          borderRadius: 10,
          color: "#9AA1AC",
          fontFamily: "'Inter', sans-serif",
          fontSize: 12.5,
          padding: "9px 0",
          cursor: draft.length >= MAX_DAYS ? "default" : "pointer",
          opacity: draft.length >= MAX_DAYS ? 0.4 : 1,
        }}
      >
        <Plus size={14} /> Add day{draft.length >= MAX_DAYS ? ` (max ${MAX_DAYS})` : ""}
      </button>
    </div>
  );
}

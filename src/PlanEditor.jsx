import React, { useState } from "react";
import { ChevronUp, ChevronDown, Trash2, Plus, Check } from "lucide-react";
import { CAT_COLOR } from "./planUtils.js";

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

export default function PlanEditor({ days, onSave, onClose }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(days)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const valid = draft.every((d) => d.exercises.length > 0 && d.exercises.every((e) => e.name.trim() && Number(e.sets) >= 1));

  const save = async () => {
    if (!valid || saving) return;
    // Normalize sets back to numbers; everything else stays as typed.
    const cleaned = draft.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({ ...e, sets: Number(e.sets), name: e.name.trim() })),
    }));
    setSaving(true);
    try {
      await onSave(cleaned);
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

      {draft.map((day, di) => (
        <div key={day.id} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: day.plate, display: "inline-block" }} />
            <h3
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
              {day.name}
            </h3>
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
    </div>
  );
}

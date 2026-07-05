import React, { useState } from "react";
import { Flame, Check } from "lucide-react";

// Cardio finisher: display + a log control (minutes, optional machine/mode).
// Entries land in `logs` under the day's finisher slug with reps = minutes.
export default function FinisherCard({ day, entries, onLog }) {
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

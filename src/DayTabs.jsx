import React from "react";

// Day selector: one plate-colored tab per plan day.
export default function DayTabs({ days, activeDay, onSelect }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
      {days.map((d) => {
        const active = d.id === activeDay;
        return (
          <button
            key={d.id}
            onClick={() => onSelect(d.id)}
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
  );
}

import React from "react";
import { Luggage } from "lucide-react";
import { TRAVEL_PROFILES } from "./equipment.js";

// Travel mode (Phase 13): equipment-profile chips that bulk-apply the
// session swap mechanism. Prop-driven like the other workout-view pieces —
// the profile matching itself lives in equipment.js, and RackedTracker owns
// the state. Tapping the active chip turns the mode off.
export default function TravelToggle({ profile, onSelect, swappedCount, unmatchedNames }) {
  const active = TRAVEL_PROFILES.some((p) => p.id === profile);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Luggage size={13} color={active ? "#5EC8D8" : "#3A3F45"} style={{ flexShrink: 0 }} />
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: active ? "#5EC8D8" : "#6B7280" }}>
          limited equipment:
        </span>
        {TRAVEL_PROFILES.map((p) => {
          const on = p.id === profile;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(on ? null : p.id)}
              style={{
                background: on ? "#5EC8D822" : "transparent",
                border: `1px solid ${on ? "#5EC8D8" : "#2A2E33"}`,
                borderRadius: 999,
                color: on ? "#5EC8D8" : "#9AA1AC",
                fontFamily: "'Inter', sans-serif",
                fontSize: 11.5,
                padding: "3px 10px",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {active && (
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#6B7280", margin: "6px 0 0 21px" }}>
          {swappedCount > 0
            ? `${swappedCount} exercise${swappedCount === 1 ? "" : "s"} swapped for this session — resets next visit.`
            : "Today's exercises already fit — nothing to swap."}
          {unmatchedNames.length > 0 && (
            <span style={{ color: "#FDE68A" }}>
              {" "}No match for {unmatchedNames.join(", ")} — swap manually or skip.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

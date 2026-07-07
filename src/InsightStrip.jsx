import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { buildWeeklyInsights } from "./recap.js";
import { cycleStatusLabel } from "./cycleUtils.js";

// Compact this-week panel on the workout view: the numbers the recap already
// computes (sessions vs planned, volume + week-over-week delta, days not yet
// trained) plus stall flags from the progression engine, rendered in-app
// instead of only leaving as paste-for-Claude text. With a mesocycle
// configured (meta.cycle, Phase 15) it also carries the week-in-block line.
export default function InsightStrip({ days, logs, today, meta }) {
  const insights = useMemo(() => buildWeeklyInsights({ days, logs, today, meta }), [days, logs, today, meta]);
  const { sessionsDone, sessionsPlanned, missedDays, volume, prevVolume, stalls, cycle } = insights;

  const deltaPct = prevVolume > 0 ? Math.round(((volume - prevVolume) / prevVolume) * 100) : null;

  return (
    <div
      style={{
        background: "#1B1E22",
        border: "1px solid #2A2E33",
        borderRadius: 10,
        padding: "10px 14px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#6B7280",
          }}
        >
          This week
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: sessionsDone >= sessionsPlanned ? "#22C55E" : "#F5F6F7" }}>
          {sessionsDone}/{sessionsPlanned} sessions
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#F5F6F7" }}>
          {volume.toLocaleString()} lb
          {deltaPct != null && (
            <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: deltaPct >= 0 ? "#22C55E" : "#E8967A" }}>
              {deltaPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {deltaPct > 0 ? "+" : ""}
              {deltaPct}%
            </span>
          )}
        </span>
      </div>

      {cycle && (
        <div
          style={{
            marginTop: 6,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: cycle.deload ? "#B9A6E0" : "#6B7280",
          }}
        >
          {cycleStatusLabel(cycle)}
        </div>
      )}

      {missedDays.length > 0 && sessionsDone < sessionsPlanned && (
        <div style={{ marginTop: 6, fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#9AA1AC" }}>
          Still to train: {missedDays.join(", ")}
        </div>
      )}

      {stalls.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6 }}>
          <AlertTriangle size={12} color="#EF4444" style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#F5B4B4" }}>
            Stalling: {stalls.map((s) => s.name).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

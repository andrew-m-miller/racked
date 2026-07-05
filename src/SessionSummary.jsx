import React from "react";
import { Trophy } from "lucide-react";
import { slug, isTimeBased, isBodyweightEx, exMetric } from "./planUtils.js";

// Totals for a finished session: weighted volume plus any exercise whose best
// set today beat its previous all-time best ("leveled up").
export function sessionStats(exercises, logs, today) {
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

// Session summary — appears once every set of the day is logged.
export default function SessionSummary({ day, stats, cardioMin, durationMin, totalSets }) {
  return (
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
  );
}

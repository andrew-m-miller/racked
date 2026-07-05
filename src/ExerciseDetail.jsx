import React from "react";
import { ChevronLeft, Trophy } from "lucide-react";
import { CAT_COLOR, exMetric, metricUnit } from "./planUtils.js";
import { fmtSets } from "./recap.js";
import { isWeighted, e1rmSeries, e1rmStats, sessionsByDate } from "./insights.js";
import { LineChart } from "./charts.jsx";

function shortDate(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function longDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function StatBlock({ label, value, sub, accent }) {
  return (
    <div style={{ flex: 1, background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: accent || "#F5F6F7" }}>
        {value}
      </div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#9AA1AC", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "#6B7280", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Full-history drill-down for one exercise, opened from a card's sparkline.
// Works for primaries and swapped-in alternates alike — each logs under its
// own slug, so `history` is already that movement's own record.
export default function ExerciseDetail({ ex, history, onClose }) {
  const values = history.map((e) => exMetric(ex, e));
  const unit = metricUnit(ex);
  const color = CAT_COLOR[ex.cat];
  const best = Math.max(...values);
  const prIndex = values.lastIndexOf(best);
  const prEntry = history[prIndex];

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
            value={best}
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
        <div style={{ background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10 }}>
          {[...sessions].reverse().map(({ date, sets }, i) => {
            const hasPr = prEntry && date === prEntry.date && sets.includes(prEntry);
            return (
              <div
                key={date}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  padding: "9px 14px",
                  borderTop: i === 0 ? "none" : "1px solid #2A2E33",
                }}
              >
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "#6B7280", flexShrink: 0, width: 86 }}>
                  {longDate(date)}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#F5F6F7", flex: 1 }}>
                  {fmtSets(ex, sets)}
                </span>
                {hasPr && <Trophy size={12} color="#FACC15" style={{ flexShrink: 0, alignSelf: "center" }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

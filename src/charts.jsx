import React from "react";
import { X, Trophy } from "lucide-react";
import { CAT_COLOR, exMetric, metricUnit } from "./planUtils.js";

function scale(values, size, padding) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (v) => size - padding - ((v - min) / span) * (size - padding * 2);
}

// Tiny inline trend line for exercise cards.
export function Sparkline({ values, color, width = 64, height = 20 }) {
  if (values.length < 2) return null;
  const y = scale(values, height, 2);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={rising ? 1 : 0.7}
      />
    </svg>
  );
}

// Shared line chart. `series` entries: { values, color, dots, trendDots, prIndex }.
// All series share x positions (one slot per index); `labels` are the x labels
// for the first and last slot.
export function LineChart({ series, labels, height = 150, unit }) {
  const width = 400; // viewBox units; rendered at 100% width
  const padX = 34;
  const padY = 14;
  const all = series.flatMap((s) => s.values);
  if (!all.length) return null;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const toY = (v) => height - padY - ((v - min) / span) * (height - padY * 2);
  const n = Math.max(...series.map((s) => s.values.length));
  const toX = (i) => padX + (n > 1 ? (i * (width - padX - 8)) / (n - 1) : (width - padX - 8) / 2);

  const gridValues = [min, (min + max) / 2, max];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ display: "block", width: "100%" }}>
        {gridValues.map((v) => (
          <g key={v}>
            <line x1={padX} x2={width - 8} y1={toY(v)} y2={toY(v)} stroke="#2A2E33" strokeWidth={1} />
            <text
              x={padX - 6}
              y={toY(v) + 3}
              textAnchor="end"
              fill="#6B7280"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}
            >
              {Math.round(v)}
            </text>
          </g>
        ))}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              <polyline
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? "4 4" : undefined}
              />
              {s.dots &&
                s.values.map((v, i) => {
                  let fill = s.color;
                  if (s.trendDots && i > 0) {
                    if (v > s.values[i - 1]) fill = "#22C55E";
                    else if (v < s.values[i - 1]) fill = "#EF4444";
                    else fill = "#6B7280";
                  }
                  const isPr = s.prIndex === i;
                  return (
                    <g key={i}>
                      {isPr && <circle cx={toX(i)} cy={toY(v)} r={6} fill="none" stroke="#FACC15" strokeWidth={1.5} />}
                      <circle cx={toX(i)} cy={toY(v)} r={2.6} fill={fill} />
                    </g>
                  );
                })}
            </g>
          );
        })}
      </svg>
      {labels && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingLeft: padX * 0.25,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: "#6B7280",
            marginTop: 2,
          }}
        >
          <span>{labels[0]}</span>
          {unit && <span>{unit}</span>}
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

function shortDate(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// Full-screen chart for one exercise: every logged set's metric over time,
// green/red dots for level-ups/drop-offs, gold ring on the all-time PR.
export function ExerciseChartModal({ ex, history, onClose }) {
  const values = history.map((e) => exMetric(ex, e));
  const unit = metricUnit(ex);
  const best = Math.max(...values);
  const prIndex = values.lastIndexOf(best);
  const prEntry = history[prIndex];
  const color = CAT_COLOR[ex.cat];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.72)",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#1B1E22",
          border: "1px solid #2A2E33",
          borderRadius: 12,
          padding: "16px 16px 14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 16, color: "#F5F6F7" }}>
              {ex.name}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "#9AA1AC", marginTop: 3 }}>
              {history.length} sets logged
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chart"
            style={{ background: "transparent", border: "none", color: "#9AA1AC", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          {values.length >= 2 ? (
            <LineChart
              series={[{ values, color, dots: true, trendDots: true, prIndex }]}
              labels={[shortDate(history[0].date), shortDate(history[history.length - 1].date)]}
              unit={unit}
            />
          ) : (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6B7280", padding: "24px 0" }}>
              Log a couple of sessions and the trend shows up here.
            </div>
          )}
        </div>

        {prEntry && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 12,
              background: "#101214",
              border: "1px solid #2A2E33",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            <Trophy size={14} color="#FACC15" style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#F5F6F7" }}>
              All-time best: {best} {unit}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "#6B7280", marginLeft: "auto" }}>
              {shortDate(prEntry.date)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

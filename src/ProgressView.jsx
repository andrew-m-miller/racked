import React, { useState } from "react";
import { Scale, Flame, ChevronLeft, ChevronRight } from "lucide-react";
import { dayForDate } from "./planUtils.js";
import { LineChart } from "./charts.jsx";
import RecapSection from "./RecapSection.jsx";

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(dateStr) {
  return new Date(dateStr + "T00:00:00");
}

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Monday of the week containing dateStr, as a YYYY-MM-DD key.
function weekKey(dateStr) {
  const d = toDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toKey(d);
}

function prevWeek(key) {
  const d = toDate(key);
  d.setDate(d.getDate() - 7);
  return toKey(d);
}

// A streak week = 3+ workouts. The current week doesn't break the streak
// while it's still in progress.
function computeStreaks(sessionDates, today) {
  const perWeek = {};
  for (const date of sessionDates) {
    const k = weekKey(date);
    perWeek[k] = (perWeek[k] || 0) + 1;
  }

  const thisWeek = weekKey(today);
  let current = 0;
  let w = thisWeek;
  if ((perWeek[w] || 0) >= 3) {
    current++;
    w = prevWeek(w);
  } else {
    w = prevWeek(w); // week in progress — look back without breaking
  }
  while ((perWeek[w] || 0) >= 3) {
    current++;
    w = prevWeek(w);
  }

  let best = 0;
  for (const k of Object.keys(perWeek)) {
    if ((perWeek[k] || 0) < 3 || (perWeek[prevWeek(k)] || 0) >= 3) continue; // only start runs at their first week
    let run = 0;
    let cursor = k;
    while ((perWeek[cursor] || 0) >= 3) {
      run++;
      const d = toDate(cursor);
      d.setDate(d.getDate() + 7);
      cursor = toKey(d);
    }
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current) };
}

function StatBlock({ label, value, accent }) {
  return (
    <div style={{ flex: 1, background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: accent || "#F5F6F7" }}>
        {value}
      </div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#9AA1AC", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SectionTitle({ icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "22px 0 10px" }}>
      {icon}
      <h2
        style={{
          fontFamily: "'Oswald', sans-serif",
          fontWeight: 600,
          fontSize: 16,
          color: "#F5F6F7",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {children}
      </h2>
    </div>
  );
}

function BodyweightSection({ weighIns, today, onAddWeighIn }) {
  const [input, setInput] = useState("");

  // One point per date (last weigh-in wins) keeps the chart honest.
  const byDate = new Map();
  for (const w of weighIns) byDate.set(w.date, parseFloat(w.weight) || 0);
  const points = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const values = points.map(([, v]) => v);

  const smoothed = points.map(([date], i) => {
    const t = toDate(date).getTime();
    const window = points.filter(([d2]) => {
      const t2 = toDate(d2).getTime();
      return t2 <= t && t2 > t - 7 * DAY_MS;
    });
    return window.reduce((s, [, v]) => s + v, 0) / window.length;
  });

  const latest = points[points.length - 1];
  let delta = null;
  if (points.length > 1 && latest) {
    const target = toDate(latest[0]).getTime() - 30 * DAY_MS;
    const anchor = points.reduce((bestP, p) =>
      Math.abs(toDate(p[0]).getTime() - target) < Math.abs(toDate(bestP[0]).getTime() - target) ? p : bestP
    );
    if (anchor !== latest) delta = latest[1] - anchor[1];
  }

  const submit = () => {
    const v = parseFloat(input);
    if (!v || v <= 0) return;
    onAddWeighIn(v);
    setInput("");
  };

  return (
    <div>
      <SectionTitle icon={<Scale size={15} color="#5EC8D8" />}>Bodyweight</SectionTitle>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <StatBlock label="current (lb)" value={latest ? latest[1] : "—"} />
        <StatBlock
          label="≈30-day change (lb)"
          value={delta == null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}`}
          accent={delta == null ? undefined : delta <= 0 ? "#22C55E" : "#E8967A"}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          inputMode="decimal"
          placeholder="lb"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            width: 82,
            background: "#101214",
            border: "1px solid #2A2E33",
            borderRadius: 6,
            padding: "7px 8px",
            color: "#F5F6F7",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={submit}
          style={{
            background: "#F5F6F7",
            color: "#101214",
            border: "none",
            borderRadius: 6,
            padding: "8px 14px",
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Log weigh-in
        </button>
      </div>

      {values.length >= 2 ? (
        <div style={{ background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 12px 8px" }}>
          <LineChart
            series={[
              { values, color: "#3A3F45", dots: true },
              { values: smoothed, color: "#5EC8D8" },
            ]}
            labels={[points[0][0].slice(5).replace("-", "/"), latest[0].slice(5).replace("-", "/")]}
            unit="lb · 7-day trend"
            height={140}
          />
        </div>
      ) : (
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#6B7280" }}>
          Weigh in about once a week — the smoothed trend appears after a couple of entries.
        </div>
      )}
    </div>
  );
}

function CalendarSection({ days, logs, today }) {
  const [offset, setOffset] = useState(0); // months back from current
  const plate = Object.fromEntries(days.map((d) => [d.id, d.plate]));

  // Map each training date to the day (A/B/C) that was performed.
  const dates = new Set();
  for (const entries of Object.values(logs)) for (const e of entries) dates.add(e.date);
  const dayByDate = {};
  for (const d of dates) dayByDate[d] = dayForDate(days, logs, d);

  const sessions = [...dates];
  const streaks = computeStreaks(sessions, today);

  const base = toDate(today);
  const month = new Date(base.getFullYear(), base.getMonth() - offset, 1);
  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstDow = month.getDay(); // Sunday-start grid
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const navButton = {
    background: "transparent",
    border: "1px solid #2A2E33",
    borderRadius: 6,
    color: "#9AA1AC",
    cursor: "pointer",
    padding: "3px 6px",
    display: "flex",
    alignItems: "center",
  };

  return (
    <div>
      <SectionTitle icon={<Flame size={15} color="#E8967A" />}>Consistency</SectionTitle>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <StatBlock label="current streak (weeks)" value={streaks.current} accent={streaks.current > 0 ? "#22C55E" : undefined} />
        <StatBlock label="best streak (weeks)" value={streaks.best} />
        <StatBlock label="total workouts" value={sessions.length} />
      </div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#6B7280", marginBottom: 14 }}>
        A streak week = 3+ workouts (Mon–Sun).
      </div>

      <div style={{ background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 14px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button type="button" style={navButton} onClick={() => setOffset(offset + 1)} aria-label="Previous month">
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 600, color: "#F5F6F7", letterSpacing: "0.03em" }}>
            {monthLabel}
          </span>
          <button
            type="button"
            style={{ ...navButton, visibility: offset === 0 ? "hidden" : "visible" }}
            onClick={() => setOffset(offset - 1)}
            aria-label="Next month"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div
              key={i}
              style={{ textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#6B7280", paddingBottom: 2 }}
            >
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={`pad-${i}`} />;
            const key = toKey(new Date(month.getFullYear(), month.getMonth(), d));
            const dayId = dayByDate[key];
            const fill = dayId ? plate[dayId] : null;
            const isToday = key === today;
            return (
              <div key={key} style={{ display: "flex", justifyContent: "center" }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: fill ? "#101214" : "#6B7280",
                    fontWeight: fill ? 700 : 400,
                    background: fill || "transparent",
                    border: isToday ? "1.5px solid #F5F6F7" : "1.5px solid transparent",
                  }}
                >
                  {d}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 12 }}>
          {days.map((d) => (
            <span key={d.id} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#9AA1AC" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: d.plate, display: "inline-block" }} />
              {d.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProgressView({ days, logs, weighIns, today, onAddWeighIn, onApplyPlanChange }) {
  return (
    <div>
      <BodyweightSection weighIns={weighIns} today={today} onAddWeighIn={onAddWeighIn} />
      <CalendarSection days={days} logs={logs} today={today} />
      <RecapSection days={days} logs={logs} weighIns={weighIns} today={today} onApplyPlanChange={onApplyPlanChange} />
    </div>
  );
}

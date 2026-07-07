import React, { useState, useMemo } from "react";
import { Scale, Flame, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { buildDayIndex, localDateKey } from "./planUtils.js";
import { useAppState } from "./AppState.jsx";
import { StatBlock, SectionTitle, ghostBtn } from "./ui.jsx";
import { LineChart } from "./charts.jsx";
import CoachSection from "./CoachSection.jsx";
import BuddySection from "./BuddySection.jsx";
import HealthSection from "./HealthSection.jsx";
import { logsToCSV, weighInsToCSV, buildExportJSON } from "./dataExport.js";

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

// A streak week = target+ workouts (the plan's sessions/week). The current
// week doesn't break the streak while it's still in progress.
function computeStreaks(sessionDates, today, target) {
  const perWeek = {};
  for (const date of sessionDates) {
    const k = weekKey(date);
    perWeek[k] = (perWeek[k] || 0) + 1;
  }

  const thisWeek = weekKey(today);
  let current = 0;
  let w = thisWeek;
  if ((perWeek[w] || 0) >= target) {
    current++;
    w = prevWeek(w);
  } else {
    w = prevWeek(w); // week in progress — look back without breaking
  }
  while ((perWeek[w] || 0) >= target) {
    current++;
    w = prevWeek(w);
  }

  let best = 0;
  for (const k of Object.keys(perWeek)) {
    if ((perWeek[k] || 0) < target || (perWeek[prevWeek(k)] || 0) >= target) continue; // only start runs at their first week
    let run = 0;
    let cursor = k;
    while ((perWeek[cursor] || 0) >= target) {
      run++;
      const d = toDate(cursor);
      d.setDate(d.getDate() + 7);
      cursor = toKey(d);
    }
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current) };
}

function BodyweightSection({ weighIns, onAddWeighIn }) {
  const [input, setInput] = useState("");

  // One point per date (last weigh-in wins) keeps the chart honest.
  const byDate = new Map();
  for (const w of weighIns) byDate.set(w.date, parseFloat(w.weight) || 0);
  const points = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const values = points.map(([, v]) => v);

  const smoothed = points.map(([date]) => {
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

function CalendarSection({ days, logs, today, meta }) {
  const [offset, setOffset] = useState(0); // months back from current
  const plate = Object.fromEntries(days.map((d) => [d.id, d.plate]));

  // Map each training date to the plan day that was performed — one pass via
  // buildDayIndex, memoized so month navigation (offset) can't recompute it.
  // `dates` is collected separately from the index: a date whose only entries
  // are orphaned slugs (renamed/dropped exercises) still counts as a workout,
  // it just gets no day color.
  const { dayByDate, sessions, streaks } = useMemo(() => {
    const dates = new Set();
    for (const entries of Object.values(logs)) for (const e of entries) dates.add(e.date);
    const target = meta?.daysPerWeek ?? days.length;
    return { dayByDate: buildDayIndex(days, logs), sessions: [...dates], streaks: computeStreaks([...dates], today, target) };
  }, [days, logs, today, meta]);

  const target = meta?.daysPerWeek ?? days.length;

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
        A streak week = {target}+ workouts (Mon–Sun).
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
            const dayId = dayByDate.get(key);
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

function downloadFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// One-tap backup of logs + weigh-ins + plan. All from the same in-memory
// state the views render (loaded through src/storage.js) — no extra fetch.
function ExportSection({ days, logs, weighIns, today, meta }) {
  const buttonStyle = ghostBtn;

  return (
    <div>
      <SectionTitle icon={<Download size={15} color="#22C55E" />}>Your data</SectionTitle>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#6B7280", marginBottom: 10 }}>
        Everything you've logged, yours to keep — JSON for a full backup, CSV for a spreadsheet.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          style={buttonStyle}
          onClick={() =>
            downloadFile(
              `racked-backup-${today}.json`,
              buildExportJSON({ logs, weighIns, plan: { meta, days }, exportedAt: new Date().toISOString() }),
              "application/json"
            )
          }
        >
          <Download size={13} />
          JSON backup
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => downloadFile(`racked-logs-${today}.csv`, logsToCSV(logs), "text/csv")}
        >
          <Download size={13} />
          Logs CSV
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => downloadFile(`racked-weigh-ins-${today}.csv`, weighInsToCSV(weighIns), "text/csv")}
        >
          <Download size={13} />
          Weigh-ins CSV
        </button>
      </div>
    </div>
  );
}

export default function ProgressView({ onApplyPlanChange }) {
  const { days, logs, weighIns, planMeta: meta, coachRuns, recordCoachRun, logWeighIn } = useAppState();
  const today = localDateKey();
  const onAddWeighIn = (weightLb) => logWeighIn(today, weightLb);
  return (
    <div>
      <BodyweightSection weighIns={weighIns} onAddWeighIn={onAddWeighIn} />
      <CalendarSection days={days} logs={logs} today={today} meta={meta} />
      <BuddySection />
      <CoachSection
        days={days}
        logs={logs}
        weighIns={weighIns}
        today={today}
        meta={meta}
        coachRuns={coachRuns}
        onRecordRun={recordCoachRun}
        onApplyPlanChange={onApplyPlanChange}
      />
      <HealthSection />
      <ExportSection days={days} logs={logs} weighIns={weighIns} today={today} meta={meta} />
    </div>
  );
}

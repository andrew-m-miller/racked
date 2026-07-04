import { slug, isTimeBased, isBodyweightEx, dayForDate, finisherSlug } from "./planUtils.js";
import { computeSuggestion, targetNumber } from "./progression.js";

// ---- Tier 1 AI coach: build a paste-ready weekly recap ----
// Turns the week's raw logs into a compact text block that reads well in the
// Claude app: sessions vs planned, volume, per-lift detail with the app's own
// next-session suggestion, finishers, and bodyweight trend.

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

// Monday of the week containing dateStr (matches the streak logic in ProgressView).
function weekStart(dateStr) {
  const d = toDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toKey(d);
}

function shiftDays(dateStr, n) {
  const d = toDate(dateStr);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

function fmtDate(dateStr) {
  return toDate(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

const EFFORT_WORD = { "-1": "easy", 0: "right", 1: "brutal" };

// Map every loggable slug (primaries + alts) to a full exercise definition and
// its plan day. Alts inherit cat/sets/reps from their slot.
function exerciseIndex(days) {
  const index = {};
  for (const d of days) {
    for (const ex of d.exercises) {
      index[slug(ex.name)] ??= { ex, dayId: d.id };
      for (const alt of ex.alts || []) {
        index[slug(alt.name)] ??= { ex: { ...ex, name: alt.name, start: alt.start, url: alt.url }, dayId: d.id };
      }
    }
  }
  return index;
}

// "45 lb × 12/12/11" when all sets share a weight, otherwise "45×12, 50×10".
// Timed holds read "40/35/30 sec"; bodyweight reps read "15/14/12 reps".
function fmtSets(ex, entries) {
  if (isTimeBased(ex)) return `${entries.map((e) => e.weight || "?").join("/")} sec`;
  if (isBodyweightEx(ex)) return `${entries.map((e) => e.reps || "?").join("/")} reps`;
  const weights = [...new Set(entries.map((e) => e.weight))];
  if (weights.length === 1) return `${weights[0] || "?"} lb × ${entries.map((e) => e.reps || "?").join("/")}`;
  return entries.map((e) => `${e.weight || "?"}×${e.reps || "?"}`).join(", ");
}

function weekVolume(logs, index, from, to) {
  let volume = 0;
  for (const [key, entries] of Object.entries(logs)) {
    const def = index[key]?.ex;
    if (key.startsWith("finisher-") || (def && (isTimeBased(def) || isBodyweightEx(def)))) continue;
    for (const e of entries) {
      if (e.date >= from && e.date <= to) volume += (parseFloat(e.weight) || 0) * (parseFloat(e.reps) || 0);
    }
  }
  return Math.round(volume);
}

export function buildWeeklyRecap({ days, logs, weighIns, today, meta }) {
  const start = weekStart(today);
  const prevStart = shiftDays(start, -7);
  const prevEnd = shiftDays(start, -1);
  const index = exerciseIndex(days);
  const inWeek = (e) => e.date >= start && e.date <= today;

  // ---- sessions ----
  const dates = new Set();
  for (const entries of Object.values(logs)) for (const e of entries) if (inWeek(e)) dates.add(e.date);
  const sessionDates = [...dates].sort();
  const dayName = Object.fromEntries(days.map((d) => [d.id, d.name]));
  const sessionLines = sessionDates.map((date) => {
    const id = dayForDate(days, logs, date);
    return `${id ? dayName[id] || id : "Session"} (${fmtDate(date)})`;
  });
  const trainedDayIds = new Set(sessionDates.map((date) => dayForDate(days, logs, date)).filter(Boolean));
  const missed = days.filter((d) => !trainedDayIds.has(d.id)).map((d) => d.name);

  // ---- finishers ----
  let finisherCount = 0;
  let finisherMin = 0;
  const finisherModes = new Set();
  for (const d of days) {
    for (const e of logs[finisherSlug(d.id)] || []) {
      if (!inWeek(e)) continue;
      finisherCount += 1;
      finisherMin += parseFloat(e.reps) || 0;
      if (e.note) finisherModes.add(e.note);
    }
  }

  // ---- volume ----
  const volume = weekVolume(logs, index, start, today);
  const prevVolume = weekVolume(logs, index, prevStart, prevEnd);

  // ---- bodyweight ----
  const sortedWeighIns = [...weighIns].sort((a, b) => (a.date < b.date ? -1 : 1));
  const latestWeigh = sortedWeighIns[sortedWeighIns.length - 1];
  const baseline = [...sortedWeighIns].reverse().find((w) => w.date < start);

  // ---- per-lift detail ----
  const liftLines = [];
  for (const [key, entries] of Object.entries(logs)) {
    if (key.startsWith("finisher-")) continue;
    const weekEntries = entries.filter(inWeek);
    if (weekEntries.length === 0) continue;
    const def = index[key]?.ex || { name: key, cat: "?", sets: weekEntries.length, reps: "?", start: "" };
    const byDate = {};
    for (const e of weekEntries) (byDate[e.date] ??= []).push(e);
    const sessions = Object.entries(byDate)
      .sort()
      .map(([date, sets]) => fmtSets(def, sets))
      .join("; ");
    const target = targetNumber(def.reps);
    const lastSet = weekEntries[weekEntries.length - 1];
    const hit = target == null || (isTimeBased(def) ? parseFloat(lastSet.weight) || 0 : parseFloat(lastSet.reps) || 0) >= target;
    const efforts = [...new Set(weekEntries.map((e) => EFFORT_WORD[e.effort]).filter(Boolean))];
    const suggestion = index[key] ? computeSuggestion(def, entries) : null;
    const parts = [
      `${def.name} (${def.cat} · target ${def.sets}×${def.reps}): ${sessions}`,
      hit ? "hit target" : "under target",
    ];
    if (efforts.length) parts.push(`felt ${efforts.join("/")}`);
    if (suggestion) parts.push(`app suggests: ${suggestion.text}${suggestion.trend === "down" ? ` (${suggestion.detail})` : ""}`);
    liftLines.push(`- ${parts.join(" — ")}`);
  }

  // ---- assemble ----
  const lines = [
    "You're my strength coach. Below is my training week from my workout tracker.",
    "Tell me: what went well, what's stalling, and what to change next week.",
    "",
    `WEEK OF ${fmtDate(start)} – ${fmtDate(today)}`,
    "",
    `Program: ${meta?.description ?? `${days.length}-day plan`}`,
    "Progression rules the app follows: +5 lb upper / +10 lb lower at rep target, +5-10 sec on core holds, 10% deload after 2 straight misses; a hit rated \"brutal\" holds the weight and counts a half-miss, an \"easy\" hit doubles the lower-body jump.",
    "",
    `Sessions: ${sessionDates.length} of ${days.length} planned${sessionLines.length ? ` — ${sessionLines.join(", ")}` : ""}`,
  ];
  if (missed.length && sessionDates.length < days.length) lines.push(`Not yet trained this week: ${missed.join(", ")}`);
  lines.push(
    `Cardio finishers: ${finisherCount} done, ${finisherMin} min total${finisherModes.size ? ` (${[...finisherModes].join(", ")})` : ""}`
  );
  lines.push(`Lifting volume: ${volume.toLocaleString()} lb${prevVolume ? ` (last week ${prevVolume.toLocaleString()} lb)` : ""}`);
  if (latestWeigh) {
    let bw = `Bodyweight: ${latestWeigh.weight} lb (${fmtDate(latestWeigh.date)})`;
    if (baseline) {
      const delta = Math.round((parseFloat(latestWeigh.weight) - parseFloat(baseline.weight)) * 10) / 10;
      bw += ` — ${delta > 0 ? "+" : ""}${delta} lb since ${fmtDate(baseline.date)}`;
    }
    lines.push(bw);
  }
  lines.push("");
  if (liftLines.length) {
    lines.push("Lifts this week:");
    lines.push(...liftLines);
  } else {
    lines.push("No lifts logged yet this week.");
  }
  return lines.join("\n");
}

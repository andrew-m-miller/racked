import React, { useMemo, useState } from "react";
import { MessageSquareText, ClipboardCopy, Check, Sparkles, RefreshCw, ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import { buildWeeklyRecap, weekStart } from "./recap.js";
import { requestCoachReview, backendErrorMessage } from "./coach.js";
import { inversePlanChange, weekLabel } from "./coachUtils.js";
import { autoCoachEnabled, setAutoCoachEnabled } from "./useAutoCoach.js";
import { FONT_UI as FONT, copyText } from "./ui.jsx";

// Phase 9: the two coaching surfaces converged. The coach's narrative +
// suggestions are the primary weekly view (cached per week in coach_runs, so
// a past run renders instantly); the Tier 1 paste-for-Claude block is demoted
// to a "raw recap" fallback below it. Suggestions apply through
// onApplyPlanChange with a persisted applied/undo state, and past weeks stay
// readable as history.

export default function CoachSection({ days, logs, weighIns, today, meta, coachRuns, onRecordRun, onApplyPlanChange }) {
  const [copied, setCopied] = useState(false);
  const [coach, setCoach] = useState({ state: "idle" }); // idle | loading | error
  const [applying, setApplying] = useState(null); // suggestion index mid-save
  const [applyErrors, setApplyErrors] = useState({}); // suggestion index -> message
  const [showRaw, setShowRaw] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [autoOn, setAutoOn] = useState(autoCoachEnabled());
  const recap = useMemo(() => buildWeeklyRecap({ days, logs, weighIns, today, meta }), [days, logs, weighIns, today, meta]);

  // coachRuns === null means the cache table isn't readable — reviews still
  // work, they just live in memory for this session (AppState keeps them).
  const runs = coachRuns || [];
  const displayRun = runs[0] || null;
  const thisWeek = weekStart(today);

  const askCoach = async () => {
    setCoach({ state: "loading" });
    setApplyErrors({});
    try {
      const review = await requestCoachReview({ recap, days });
      onRecordRun({ week_start: thisWeek, review, applied: {} });
      setCoach({ state: "idle" });
    } catch (err) {
      setCoach({ state: "error", message: backendErrorMessage(err, "Coach") });
    }
  };

  const apply = async (i, change) => {
    setApplying(i);
    setApplyErrors((e) => ({ ...e, [i]: undefined }));
    try {
      // Capture the revert before the plan changes out from under us.
      const inverse = inversePlanChange(days, change);
      await onApplyPlanChange(change);
      onRecordRun({ ...displayRun, applied: { ...displayRun.applied, [i]: { inverse } } });
    } catch (err) {
      setApplyErrors((e) => ({ ...e, [i]: String(err?.message || "Couldn't apply — try again.") }));
    } finally {
      setApplying(null);
    }
  };

  const undo = async (i) => {
    const inverse = displayRun.applied?.[i]?.inverse;
    setApplying(i);
    try {
      if (inverse) await onApplyPlanChange(inverse);
      const applied = { ...displayRun.applied };
      delete applied[i];
      onRecordRun({ ...displayRun, applied });
    } catch (err) {
      setApplyErrors((e) => ({ ...e, [i]: String(err?.message || "Couldn't undo — try again.") }));
    } finally {
      setApplying(null);
    }
  };

  const copy = async () => {
    await copyText(recap);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleAuto = () => {
    setAutoCoachEnabled(!autoOn);
    setAutoOn(!autoOn);
  };

  const ghostBtn = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "1px solid #2A2E33",
    borderRadius: 6,
    color: "#9AA1AC",
    padding: "6px 10px",
    fontFamily: FONT,
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
  };

  const renderSuggestions = (run, interactive) =>
    (run.review.suggestions || []).map((s, i) => {
      const isApplied = !!run.applied?.[i];
      return (
        <div key={i} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #2A2E33" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, color: "#F5F6F7" }}>{s.title}</div>
              <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9AA1AC", marginTop: 3, lineHeight: 1.5 }}>{s.detail}</div>
              {interactive && applyErrors[i] && (
                <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#F5B4B4", marginTop: 4 }}>{applyErrors[i]}</div>
              )}
            </div>
            {s.plan_change && !interactive && isApplied && (
              <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, fontFamily: FONT, fontWeight: 600, fontSize: 11.5, color: "#22C55E" }}>
                <Check size={12} /> Applied
              </span>
            )}
            {s.plan_change && interactive && (
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                {/* The whole group disables while any apply/undo is in flight,
                    so a second tap can't record against a stale `applied` map. */}
                <button
                  type="button"
                  disabled={isApplied || applying != null}
                  onClick={() => apply(i, s.plan_change)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: isApplied ? "#14321C" : "#B9A6E0",
                    color: isApplied ? "#22C55E" : "#101214",
                    border: isApplied ? "1px solid #22C55E" : "1px solid transparent",
                    borderRadius: 999,
                    padding: "5px 12px",
                    fontFamily: FONT,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: isApplied ? "default" : "pointer",
                    opacity: applying === i ? 0.6 : 1,
                  }}
                >
                  {isApplied ? (
                    <>
                      <Check size={12} /> Applied
                    </>
                  ) : (
                    "Apply to plan"
                  )}
                </button>
                {isApplied && (
                  <button
                    type="button"
                    disabled={applying != null}
                    onClick={() => undo(i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      background: "transparent",
                      border: "none",
                      color: "#6B7280",
                      padding: "2px 4px",
                      fontFamily: FONT,
                      fontWeight: 600,
                      fontSize: 11.5,
                      cursor: "pointer",
                    }}
                  >
                    <Undo2 size={11} /> Undo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      );
    });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "22px 0 10px" }}>
        <MessageSquareText size={15} color="#B9A6E0" />
        <h2
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontWeight: 600,
            fontSize: 16,
            color: "#F5F6F7",
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            flex: 1,
          }}
        >
          Weekly coach
        </h2>
        {displayRun && (
          <button type="button" onClick={askCoach} disabled={coach.state === "loading"} style={{ ...ghostBtn, opacity: coach.state === "loading" ? 0.6 : 1 }}>
            <RefreshCw size={12} />
            {coach.state === "loading" ? "Thinking…" : displayRun.week_start === thisWeek ? "Re-run" : "Review this week"}
          </button>
        )}
      </div>

      <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#6B7280", marginBottom: 10 }}>
        Claude's read on your training week — suggestions apply straight to your plan.
      </div>

      {displayRun ? (
        <div style={{ background: "#1B1E22", border: "1px solid #B9A6E055", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "#6B7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {weekLabel(displayRun.week_start)}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: "#F5F6F7", lineHeight: 1.55 }}>{displayRun.review.narrative}</div>
          {renderSuggestions(displayRun, true)}
        </div>
      ) : (
        <button
          type="button"
          onClick={askCoach}
          disabled={coach.state === "loading"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            background: "#1B1E22",
            border: "1px solid #B9A6E0",
            borderRadius: 8,
            color: "#B9A6E0",
            padding: "10px 12px",
            fontFamily: FONT,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            opacity: coach.state === "loading" ? 0.6 : 1,
          }}
        >
          <Sparkles size={14} />
          {coach.state === "loading" ? "Coach is thinking…" : "Get coach review"}
        </button>
      )}

      {coach.state === "error" && (
        <div style={{ marginTop: 10, fontFamily: FONT, fontSize: 12.5, color: "#F5B4B4" }}>{coach.message}</div>
      )}

      {/* Weekly auto-run: the client-side stand-in for a Sunday-night cron */}
      <button
        type="button"
        onClick={toggleAuto}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
          background: "transparent",
          border: "none",
          padding: "4px 0",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 15,
            height: 15,
            borderRadius: 4,
            border: autoOn ? "1px solid #22C55E" : "1px solid #3A3F46",
            background: autoOn ? "#14321C" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {autoOn && <Check size={11} color="#22C55E" />}
        </span>
        <span style={{ fontFamily: FONT, fontSize: 12, color: "#9AA1AC" }}>
          Run automatically when a new week starts (reviews the finished week)
        </span>
      </button>

      {/* Raw recap, demoted to a fallback for offline / paste-into-Claude use */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
        <span style={{ fontFamily: FONT, fontSize: 11.5, color: "#6B7280", flex: 1 }}>Raw recap — paste it into the Claude app instead.</span>
        <button type="button" onClick={() => setShowRaw((v) => !v)} style={ghostBtn}>
          {showRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showRaw ? "Hide" : "View"}
        </button>
        <button
          type="button"
          onClick={copy}
          style={{
            ...ghostBtn,
            background: copied ? "#14321C" : "#F5F6F7",
            color: copied ? "#22C55E" : "#101214",
            border: copied ? "1px solid #22C55E" : "1px solid transparent",
          }}
        >
          {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
          {copied ? "Copied" : "Copy for Claude"}
        </button>
      </div>

      {showRaw && (
        <pre
          style={{
            background: "#1B1E22",
            border: "1px solid #2A2E33",
            borderRadius: 10,
            padding: "12px 14px",
            margin: "10px 0 0",
            maxHeight: 260,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            lineHeight: 1.55,
            color: "#9AA1AC",
          }}
        >
          {recap}
        </pre>
      )}

      {/* Coach history: past weeks' reviews + what was acted on */}
      {runs.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={() => setShowHistory((v) => !v)} style={ghostBtn}>
            {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Past check-ins ({runs.length - 1})
          </button>
          {showHistory &&
            runs.slice(1).map((run) => (
              <div
                key={run.week_start}
                style={{ background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 14px", marginTop: 10 }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {weekLabel(run.week_start)}
                </div>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9AA1AC", lineHeight: 1.55 }}>{run.review.narrative}</div>
                {renderSuggestions(run, false)}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

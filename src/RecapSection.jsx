import React, { useMemo, useState } from "react";
import { MessageSquareText, ClipboardCopy, Check, Sparkles } from "lucide-react";
import { buildWeeklyRecap } from "./recap.js";
import { supabase } from "./supabaseClient.js";

// Tier 1 AI coach: the week's training as a paste-ready text block, one tap
// copies it for a conversational review in the Claude app. Tier 2: the same
// recap goes to the `coach` Edge Function (Claude Opus 4.8 server-side) and
// the advice renders in-app, with one-tap-applicable plan tweaks.
export default function RecapSection({ days, logs, weighIns, today, onApplyPlanChange }) {
  const [copied, setCopied] = useState(false);
  const [coach, setCoach] = useState({ state: "idle" }); // idle | loading | error | done
  const [applied, setApplied] = useState({}); // suggestion index -> true
  const recap = useMemo(() => buildWeeklyRecap({ days, logs, weighIns, today }), [days, logs, weighIns, today]);

  const askCoach = async () => {
    setCoach({ state: "loading" });
    setApplied({});
    try {
      const { data, error } = await supabase.functions.invoke("coach", {
        body: {
          recap,
          plan: { days: days.map((d) => ({ name: d.name, exercises: d.exercises.map(({ name, sets, reps }) => ({ name, sets, reps })) })) },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCoach({ state: "done", review: data });
    } catch (err) {
      const msg = /not found|404|Failed to send/i.test(String(err?.message))
        ? "Coach backend isn't deployed yet — see the README for the one-time Edge Function setup."
        : String(err?.message || "Something went wrong — try again.");
      setCoach({ state: "error", message: msg });
    }
  };

  const apply = async (i, change) => {
    try {
      await onApplyPlanChange(change);
      setApplied((a) => ({ ...a, [i]: true }));
    } catch {
      // save failed — the app-level error banner reports it
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recap);
    } catch {
      // clipboard API blocked (old browser / non-secure context) — textarea fallback
      const ta = document.createElement("textarea");
      ta.value = recap;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          Weekly recap
        </h2>
        <button
          type="button"
          onClick={copy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: copied ? "#14321C" : "#F5F6F7",
            color: copied ? "#22C55E" : "#101214",
            border: copied ? "1px solid #22C55E" : "1px solid transparent",
            borderRadius: 6,
            padding: "6px 12px",
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
          {copied ? "Copied" : "Copy for Claude"}
        </button>
      </div>

      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#6B7280", marginBottom: 10 }}>
        Paste it into the Claude app for a coaching review of your week.
      </div>

      <pre
        style={{
          background: "#1B1E22",
          border: "1px solid #2A2E33",
          borderRadius: 10,
          padding: "12px 14px",
          margin: 0,
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

      {/* Tier 2: in-app coach */}
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
          marginTop: 10,
          background: "#1B1E22",
          border: "1px solid #B9A6E0",
          borderRadius: 8,
          color: "#B9A6E0",
          padding: "10px 12px",
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          opacity: coach.state === "loading" ? 0.6 : 1,
        }}
      >
        <Sparkles size={14} />
        {coach.state === "loading" ? "Coach is thinking…" : "Get coach review"}
      </button>

      {coach.state === "error" && (
        <div style={{ marginTop: 10, fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#F5B4B4" }}>
          {coach.message}
        </div>
      )}

      {coach.state === "done" && (
        <div
          style={{
            marginTop: 10,
            background: "#1B1E22",
            border: "1px solid #B9A6E055",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#F5F6F7", lineHeight: 1.55 }}>
            {coach.review.narrative}
          </div>
          {(coach.review.suggestions || []).map((s, i) => (
            <div key={i} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #2A2E33" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, color: "#F5F6F7" }}>
                    {s.title}
                  </div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#9AA1AC", marginTop: 3, lineHeight: 1.5 }}>
                    {s.detail}
                  </div>
                </div>
                {s.plan_change && (
                  <button
                    type="button"
                    disabled={applied[i]}
                    onClick={() => apply(i, s.plan_change)}
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      background: applied[i] ? "#14321C" : "#B9A6E0",
                      color: applied[i] ? "#22C55E" : "#101214",
                      border: applied[i] ? "1px solid #22C55E" : "1px solid transparent",
                      borderRadius: 999,
                      padding: "5px 12px",
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: applied[i] ? "default" : "pointer",
                    }}
                  >
                    {applied[i] ? (
                      <>
                        <Check size={12} /> Applied
                      </>
                    ) : (
                      "Apply to plan"
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

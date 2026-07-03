import React, { useMemo, useState } from "react";
import { MessageSquareText, ClipboardCopy, Check } from "lucide-react";
import { buildWeeklyRecap } from "./recap.js";

// Tier 1 AI coach: the week's training as a paste-ready text block. One tap
// copies it for a conversational review in the Claude app.
export default function RecapSection({ days, logs, weighIns, today }) {
  const [copied, setCopied] = useState(false);
  const recap = useMemo(() => buildWeeklyRecap({ days, logs, weighIns, today }), [days, logs, weighIns, today]);

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
    </div>
  );
}

import React, { useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";

// Shared primitives for the inline-style system (Phase 11). Before this
// module, StatBlock, section headers, the copy button, and the fonts @import
// were each duplicated across view files — every restyle touched all the
// copies. Anything used by two or more views belongs here; one-off styles
// stay local to their component.

export const FONT_UI = "'Inter', sans-serif";
export const FONT_MONO = "'JetBrains Mono', monospace";
export const FONT_HEAD = "'Oswald', sans-serif";

// Loaded once per <style> block (RackedTracker, AuthGate); the service worker
// runtime-caches both the stylesheet and the font files for offline.
export const FONTS_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');";

// The filled secondary button (Export, Health sync, Notifications).
export const ghostBtn = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "#1B1E22",
  border: "1px solid #2A2E33",
  borderRadius: 8,
  color: "#9AA1AC",
  cursor: "pointer",
  padding: "8px 12px",
  fontFamily: FONT_UI,
  fontSize: 12.5,
  fontWeight: 500,
};

// Headline number + caption card (Progress stats, exercise detail).
export function StatBlock({ label, value, sub, accent }) {
  return (
    <div style={{ flex: 1, background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 20, fontWeight: 600, color: accent || "#F5F6F7" }}>{value}</div>
      <div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: "#9AA1AC", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: "#6B7280", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Icon + uppercase heading that opens each Progress-screen section.
export function SectionTitle({ icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "22px 0 10px" }}>
      {icon}
      <h2
        style={{
          fontFamily: FONT_HEAD,
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

// Clipboard write with the textarea fallback for blocked clipboard APIs
// (old browsers / non-secure contexts). Both layers guarded so a fully
// unavailable clipboard degrades to a no-op instead of an exception.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      // clipboard fully unavailable — nothing to do
    }
  }
}

// Small copy-to-clipboard button with a 2s "Copied" confirmation.
export function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      style={{
        ...ghostBtn,
        padding: "6px 10px",
        fontSize: 12,
        background: copied ? "#14321C" : "#1B1E22",
        color: copied ? "#22C55E" : "#9AA1AC",
        border: copied ? "1px solid #22C55E" : "1px solid #2A2E33",
      }}
    >
      {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}
      {copied ? "Copied" : label}
    </button>
  );
}

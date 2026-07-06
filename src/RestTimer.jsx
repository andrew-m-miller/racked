import React, { useState, useEffect, useRef } from "react";
import { Timer } from "lucide-react";

// Fixed bottom bar counting down the rest between sets; vibrates and
// auto-dismisses shortly after hitting zero.
export default function RestTimer({ endsAt, onExtend, onSkip }) {
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const done = remaining <= 0;

  useEffect(() => {
    if (!done || firedRef.current) return;
    firedRef.current = true;
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const id = setTimeout(onSkip, 5000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");
  const pillButton = {
    background: "transparent",
    border: "1px solid #2A2E33",
    borderRadius: 6,
    padding: "5px 10px",
    color: "#9AA1AC",
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 16px calc(16px + env(safe-area-inset-bottom))",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: done ? "#14321C" : "#1B1E22",
          border: `1px solid ${done ? "#22C55E" : "#2A2E33"}`,
          borderRadius: 10,
          padding: "10px 14px",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
        }}
      >
        <Timer size={16} color={done ? "#22C55E" : "#9AA1AC"} style={{ flexShrink: 0 }} />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 16,
            fontWeight: 600,
            color: done ? "#22C55E" : "#F5F6F7",
            minWidth: 44,
          }}
        >
          {done ? "GO" : `${mm}:${ss}`}
        </span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9AA1AC", flex: 1 }}>
          {done ? "Rest over — next set" : "Resting"}
        </span>
        {!done && (
          <button type="button" onClick={onExtend} style={pillButton}>
            +30s
          </button>
        )}
        <button type="button" onClick={onSkip} style={pillButton}>
          {done ? "Dismiss" : "Skip"}
        </button>
      </div>
    </div>
  );
}

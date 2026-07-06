import React from "react";
import { Trophy } from "lucide-react";

// Fixed top toast celebrating a new personal record; the parent owns the
// message and the auto-dismiss timer.
export default function PRToast({ message }) {
  return (
    <div
      style={{
        position: "fixed",
        top: "calc(14px + env(safe-area-inset-top))",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 16px",
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#1B1E22",
          border: "1px solid #FACC15",
          borderRadius: 999,
          padding: "8px 16px",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
        }}
      >
        <Trophy size={14} color="#FACC15" />
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: "#F5F6F7" }}>
          {message}
        </span>
      </div>
    </div>
  );
}

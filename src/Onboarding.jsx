import React, { useState, useEffect } from "react";
import { Sparkles, Flame, Check, AlertTriangle } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { slug, CAT_COLOR } from "./planUtils.js";

// AI plan designer: a guided goals form → the plan-designer Edge Function
// (Claude, 30-60s) → a review screen with tweak-and-regenerate. While the
// user reviews, find-videos runs in the background upgrading primaries'
// YouTube search links to real tutorial videos. `new` mode is first-run
// onboarding (with a Skip to the bundled seed); `replace` mode comes from
// the plan editor and swaps out the current plan on accept.

const GOALS = [
  { value: "strength", label: "Strength" },
  { value: "muscle", label: "Muscle" },
  { value: "fat_loss", label: "Fat loss" },
  { value: "general", label: "General fitness" },
];
const EXPERIENCES = [
  { value: "new", label: "New to lifting" },
  { value: "returning", label: "Returning" },
  { value: "experienced", label: "Experienced" },
];
const EQUIPMENT = [
  { value: "full_gym", label: "Full gym" },
  { value: "dumbbells_bench", label: "Dumbbells + bench" },
  { value: "bodyweight", label: "Bodyweight only" },
];
const DAY_OPTIONS = [2, 3, 4, 5];

const STATUS_LINES = [
  "Designing your split…",
  "Picking exercises for your equipment…",
  "Setting starting weights…",
  "Adding cardio finishers…",
  "Choosing alternates for busy machines…",
];

const labelStyle = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  color: "#6B7280",
  display: "block",
  marginBottom: 6,
};

function PillGroup({ label, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                background: active ? "#B9A6E022" : "#101214",
                border: `1px solid ${active ? "#B9A6E0" : "#2A2E33"}`,
                borderRadius: 999,
                color: active ? "#B9A6E0" : "#9AA1AC",
                fontFamily: "'Inter', sans-serif",
                fontSize: 12.5,
                padding: "7px 14px",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Onboarding({ mode, onAccept, onSkip, onCancel }) {
  const [step, setStep] = useState("form"); // "form" | "generating" | "review"
  const [goal, setGoal] = useState("general");
  const [experience, setExperience] = useState("new");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [equipment, setEquipment] = useState("full_gym");
  const [constraints, setConstraints] = useState("");
  const [tweak, setTweak] = useState("");
  const [result, setResult] = useState(null); // { summary, meta, days }
  const [genCount, setGenCount] = useState(0); // bumps per successful generation → re-fires find-videos
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [video, setVideo] = useState({ state: "idle", count: 0, total: 0 }); // idle | loading | done | error

  // Elapsed-seconds counter + rotating status line while Claude designs.
  useEffect(() => {
    if (step !== "generating") return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [step]);

  // Background video upgrade: fire find-videos when a fresh plan lands (and
  // again after each regenerate), then merge real watch URLs into primaries.
  // Alternates keep their search links. Never blocks the review screen —
  // on any failure the search links still work.
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    const names = result.days.flatMap((d) => d.exercises.map((ex) => ex.name));
    const slugs = new Set(names.map(slug));
    setVideo({ state: "loading", count: 0, total: slugs.size });
    supabase.functions
      .invoke("find-videos", { body: { exercises: names } })
      .then(({ data, error: invokeError }) => {
        if (cancelled) return;
        const map = data?.videos;
        if (invokeError || !map) {
          setVideo((v) => ({ ...v, state: "error" }));
          return;
        }
        setResult((r) => ({
          ...r,
          days: r.days.map((d) => ({
            ...d,
            exercises: d.exercises.map((ex) => (map[slug(ex.name)] ? { ...ex, url: map[slug(ex.name)].url } : ex)),
          })),
        }));
        setVideo({
          state: "done",
          count: [...slugs].filter((s) => map[s]).length,
          total: slugs.size,
        });
      })
      .catch(() => {
        if (!cancelled) setVideo((v) => ({ ...v, state: "error" }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genCount]);

  const generate = async (tweakNote) => {
    setStep("generating");
    setError(null);
    try {
      const body = { goal, experience, daysPerWeek, equipment };
      if (constraints.trim()) body.constraints = constraints.trim();
      if (tweakNote && result) {
        body.tweak = tweakNote;
        body.previousDays = result.days.map((d) => d.name);
      }
      const { data, error: invokeError } = await supabase.functions.invoke("plan-designer", { body });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      setGenCount((n) => n + 1);
      setTweak("");
      setStep("review");
    } catch (err) {
      const msg = /not found|404|Failed to send/i.test(String(err?.message))
        ? "Plan designer backend isn't deployed yet — see the README for the one-time Edge Function setup."
        : String(err?.message || "Something went wrong — try again.");
      setError(msg);
      // A failed regenerate keeps the last good plan on screen.
      setStep(result ? "review" : "form");
    }
  };

  const accept = async () => {
    if (accepting) return;
    setAccepting(true);
    setError(null);
    try {
      await onAccept({ meta: result.meta, days: result.days });
    } catch {
      setError("Couldn't save the plan — check your connection and try again.");
      setAccepting(false);
    }
  };

  const heading = (text) => (
    <h2
      style={{
        fontFamily: "'Oswald', sans-serif",
        fontWeight: 600,
        fontSize: 18,
        color: "#F5F6F7",
        margin: "0 0 4px",
        textTransform: "uppercase",
        letterSpacing: "0.02em",
      }}
    >
      {text}
    </h2>
  );

  const errorBox = error && (
    <div
      style={{
        background: "#3A1416",
        border: "1px solid #EF444455",
        borderRadius: 8,
        padding: "9px 12px",
        marginBottom: 14,
        fontFamily: "'Inter', sans-serif",
        fontSize: 12.5,
        color: "#F5B4B4",
      }}
    >
      {error}
    </div>
  );

  // ---- generating ----
  if (step === "generating") {
    return (
      <div style={{ textAlign: "center", padding: "56px 0" }}>
        <style>{`
          @keyframes racked-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.88); } }
        `}</style>
        <div style={{ display: "inline-block", animation: "racked-pulse 1.6s ease-in-out infinite" }}>
          <Sparkles size={36} color="#B9A6E0" />
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: "#F5F6F7", marginTop: 18 }}>
          {STATUS_LINES[Math.floor(elapsed / 6) % STATUS_LINES.length]}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#6B7280", marginTop: 10 }}>
          {elapsed}s · usually takes 30–60 seconds
        </div>
      </div>
    );
  }

  // ---- review ----
  if (step === "review" && result) {
    return (
      <div>
        {heading("Your plan")}
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#9AA1AC", margin: "0 0 8px", lineHeight: 1.5 }}>
          {result.summary}
        </p>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#6B7280", marginBottom: 14 }}>
          {video.state === "loading" && "Finding video tutorials…"}
          {video.state === "done" && `Video tutorials linked ✓ (${video.count} of ${video.total})`}
        </div>

        {errorBox}

        {result.days.map((d) => (
          <div
            key={d.id}
            style={{
              background: "#1B1E22",
              border: "1px solid #2A2E33",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: d.plate, display: "inline-block" }} />
              <span style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 14, color: "#F5F6F7", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                {d.label} · {d.name}
              </span>
            </div>
            {d.exercises.map((ex) => (
              <div
                key={slug(ex.name)}
                style={{ display: "flex", justifyContent: "space-between", gap: 8, fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#9AA1AC", padding: "2px 0" }}
              >
                <span style={{ color: "#E5E7EB" }}>{ex.name}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, flexShrink: 0 }}>
                  {ex.sets}×{ex.reps} <span style={{ color: CAT_COLOR[ex.cat] }}>{ex.cat[0]}</span>
                </span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#9AA1AC" }}>
              <Flame size={13} color="#E8967A" style={{ flexShrink: 0 }} />
              {d.finisher}
            </div>
          </div>
        ))}

        {/* Tweak + regenerate */}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input
            type="text"
            placeholder="What would you change? (optional)"
            value={tweak}
            onChange={(e) => setTweak(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              background: "#101214",
              border: "1px solid #2A2E33",
              borderRadius: 6,
              padding: "8px 10px",
              color: "#F5F6F7",
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => generate(tweak.trim())}
            style={{
              background: "transparent",
              border: "1px solid #B9A6E0",
              borderRadius: 6,
              color: "#B9A6E0",
              fontFamily: "'Inter', sans-serif",
              fontSize: 12.5,
              fontWeight: 600,
              padding: "8px 12px",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Regenerate
          </button>
        </div>

        <button
          type="button"
          onClick={accept}
          disabled={accepting}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            marginTop: 10,
            background: "#F5F6F7",
            color: "#101214",
            border: "none",
            borderRadius: 8,
            padding: "12px",
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            opacity: accepting ? 0.6 : 1,
          }}
        >
          <Check size={15} strokeWidth={3} />
          {accepting ? "Saving…" : "Start this plan"}
        </button>
      </div>
    );
  }

  // ---- form ----
  return (
    <div>
      {heading(mode === "replace" ? "Design a new plan" : "Let's build your plan")}
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#6B7280", margin: "0 0 16px", lineHeight: 1.5 }}>
        Answer a few questions and the AI coach designs a weekly plan around your goal and gym.
      </p>

      {mode === "replace" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#3A1416",
            border: "1px solid #EF444455",
            borderRadius: 8,
            padding: "9px 12px",
            marginBottom: 16,
          }}
        >
          <AlertTriangle size={15} color="#EF4444" style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#F5B4B4" }}>
            This replaces your current plan. Your logged history is kept.
          </span>
        </div>
      )}

      {errorBox}

      <PillGroup label="Goal" options={GOALS} value={goal} onChange={setGoal} />
      <PillGroup label="Experience" options={EXPERIENCES} value={experience} onChange={setExperience} />
      <PillGroup
        label="Days per week"
        options={DAY_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
        value={daysPerWeek}
        onChange={setDaysPerWeek}
      />
      <PillGroup label="Equipment" options={EQUIPMENT} value={equipment} onChange={setEquipment} />

      <div style={{ marginBottom: 18 }}>
        <span style={labelStyle}>Anything to work around? (injuries, dislikes, time limits)</span>
        <textarea
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          rows={2}
          placeholder="e.g. bad knees, no barbell squats, 45 min sessions"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#101214",
            border: "1px solid #2A2E33",
            borderRadius: 6,
            padding: "8px 10px",
            color: "#F5F6F7",
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            outline: "none",
            resize: "vertical",
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => generate()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          background: "#B9A6E0",
          color: "#101214",
          border: "none",
          borderRadius: 8,
          padding: "12px",
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        <Sparkles size={15} />
        Design my plan
      </button>

      {mode === "new" ? (
        <button
          type="button"
          onClick={onSkip}
          style={{
            display: "block",
            margin: "14px auto 0",
            background: "transparent",
            border: "none",
            color: "#6B7280",
            cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Skip — use the standard 3-day plan
        </button>
      ) : (
        <button
          type="button"
          onClick={onCancel}
          style={{
            display: "block",
            margin: "14px auto 0",
            background: "transparent",
            border: "none",
            color: "#6B7280",
            cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Cancel — keep my current plan
        </button>
      )}
    </div>
  );
}

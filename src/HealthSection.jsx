import React, { useEffect, useState } from "react";
import { Bell, BellOff, HeartPulse, Check, ClipboardCopy, ChevronDown, ChevronUp } from "lucide-react";
import { detectPushSupport, getPushSubscription, enablePush, disablePush } from "./push.js";
import { loadSyncToken, saveSyncToken, deleteSyncToken } from "./storage.js";
import { makeSyncToken, tokenedHealthSyncUrl } from "./healthSyncUtils.js";

// Phase 10: the device-integration corner of the Progress screen — web push
// notifications (rest timer + weekly check-in nudge) and the Apple Health /
// Health Connect bridge. Both are strictly additive: unsupported browsers,
// missing VAPID config, or a not-yet-migrated database all degrade to a
// hint instead of an error.
const FONT = "'Inter', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";

function Header({ icon, children }) {
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

const ghostBtn = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "#1B1E22",
  border: "1px solid #2A2E33",
  borderRadius: 8,
  color: "#9AA1AC",
  cursor: "pointer",
  padding: "8px 12px",
  fontFamily: FONT,
  fontSize: 12.5,
  fontWeight: 500,
};

const hintText = { fontFamily: FONT, fontSize: 11.5, color: "#6B7280", lineHeight: 1.5 };
const errorText = { fontFamily: FONT, fontSize: 12, color: "#F5B4B4", marginTop: 8 };

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
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

function NotificationsBlock() {
  const [support] = useState(() => detectPushSupport());
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (support === "ready") getPushSubscription().then((sub) => setOn(!!sub));
  }, [support]);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (on) await disablePush();
      else await enablePush();
      setOn(!on);
    } catch (err) {
      setError(String(err?.message || "Something went wrong — try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header icon={<Bell size={15} color="#FACC15" />}>Notifications</Header>
      <div style={{ ...hintText, marginBottom: 10 }}>
        A ping when your rest timer ends while the phone is locked, and a nudge when a new week's check-in is ready.
      </div>

      {support === "unconfigured" && (
        <div style={hintText}>
          Push isn't configured for this deployment — see the Phase 10 section of the README (VAPID keys + the
          push-send function).
        </div>
      )}
      {support === "needs-install" && (
        <div style={hintText}>
          On iPhone, notifications only work from the installed app: Share → Add to Home Screen, then enable them
          here.
        </div>
      )}
      {support === "unsupported" && <div style={hintText}>This browser doesn't support web push.</div>}

      {support === "ready" && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          style={{
            ...ghostBtn,
            opacity: busy ? 0.6 : 1,
            background: on ? "#14321C" : "#1B1E22",
            color: on ? "#22C55E" : "#9AA1AC",
            border: on ? "1px solid #22C55E" : "1px solid #2A2E33",
          }}
        >
          {on ? <Check size={13} /> : <BellOff size={13} />}
          {busy ? "Working…" : on ? "Notifications on — tap to turn off" : "Enable notifications"}
        </button>
      )}
      {error && <div style={errorText}>{error}</div>}
    </div>
  );
}

function HealthSyncBlock() {
  const [token, setToken] = useState(undefined); // undefined loading · null none yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    loadSyncToken()
      .then(setToken)
      .catch(() => setToken(null));
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    const next = makeSyncToken(crypto.getRandomValues(new Uint8Array(24)));
    try {
      await saveSyncToken(next);
      setToken(next);
    } catch {
      setError("Couldn't save a sync token — make sure the Phase 10 migration (sync_tokens) has run; see the README.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteSyncToken();
      setToken(null);
    } catch {
      setError("Couldn't revoke — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const url = token ? tokenedHealthSyncUrl(SUPABASE_URL, token) : null;

  return (
    <div>
      <Header icon={<HeartPulse size={15} color="#E8967A" />}>Health sync</Header>
      <div style={{ ...hintText, marginBottom: 10 }}>
        Bridge to Apple Health / Health Connect via a Shortcut: it POSTs your weigh-ins in and GETs finished workouts
        out — no HealthKit API exists for web apps, so the Shortcut is the messenger.
      </div>

      {token === undefined ? null : token === null ? (
        <button type="button" onClick={create} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>
          <HeartPulse size={13} />
          {busy ? "Working…" : "Set up health sync"}
        </button>
      ) : (
        <div style={{ background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
            Your private sync URL — treat it like a password
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: "#9AA1AC",
              wordBreak: "break-all",
              lineHeight: 1.5,
              marginBottom: 10,
            }}
          >
            {url}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <CopyButton text={url} label="Copy URL" />
            <button type="button" onClick={() => setShowHow((v) => !v)} style={{ ...ghostBtn, padding: "6px 10px", fontSize: 12 }}>
              {showHow ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Shortcut setup
            </button>
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              style={{ background: "transparent", border: "none", color: "#6B7280", cursor: "pointer", fontFamily: FONT, fontSize: 11.5, padding: "4px 2px", marginLeft: "auto" }}
            >
              Revoke
            </button>
          </div>

          {showHow && (
            <div style={{ ...hintText, marginTop: 12, borderTop: "1px solid #2A2E33", paddingTop: 12 }}>
              <div style={{ color: "#9AA1AC", fontWeight: 600, marginBottom: 4 }}>Weigh-ins → Racked (iPhone)</div>
              1. Shortcuts app → new shortcut → <em>Find Health Samples</em>: Type is Weight; Sort by Start Date,
              Order Latest First; Limit 1. A Start Date filter condition is optional — delete it or keep "in the
              last week", either works.
              <br />
              2. <em>Get Contents of URL</em>: the URL above, Method POST, Request Body JSON —{" "}
              <span style={{ fontFamily: MONO }}>weight_lb</span> (Number) = the sample's value,{" "}
              <span style={{ fontFamily: MONO }}>date</span> (Text) = the sample's Start Date property, Date Format
              Custom <span style={{ fontFamily: MONO }}>yyyy-MM-dd</span>.
              <br />
              3. Automation: run it daily after your usual weigh-in time. Re-sends of the same weight/date are
              ignored, so re-runs are safe.
              <div style={{ color: "#9AA1AC", fontWeight: 600, margin: "10px 0 4px" }}>Racked → Apple Health</div>
              1. New shortcut → <em>Get Contents of URL</em>: the URL above (GET). It returns today's session —{" "}
              <span style={{ fontFamily: MONO }}>{"{date, sets, lift_min, cardio_min, finisher_done}"}</span>.
              <br />
              2. <em>Log Workout</em>: Traditional Strength Training, duration ={" "}
              <span style={{ fontFamily: MONO }}>lift_min</span>; add a second Log Workout with{" "}
              <span style={{ fontFamily: MONO }}>cardio_min</span> if you want the finisher counted separately.
              <br />
              3. Automation: run it in the evening on training days (add{" "}
              <span style={{ fontFamily: MONO }}>&amp;since=YYYY-MM-DD</span> to backfill a date range).
            </div>
          )}
        </div>
      )}
      {error && <div style={errorText}>{error}</div>}
    </div>
  );
}

export default function HealthSection() {
  return (
    <div>
      <NotificationsBlock />
      <HealthSyncBlock />
    </div>
  );
}

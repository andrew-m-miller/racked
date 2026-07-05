import React, { useState, useEffect } from "react";
import { Dumbbell, Mail } from "lucide-react";
import { supabase } from "./supabaseClient.js";

// Magic-link sign-in wall. Renders children(session) once authenticated; the
// session persists in localStorage, so after the first sign-in this is
// invisible — including offline, where the cached session is used.
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: "#101214", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#6B7280", fontSize: 13 }}>Loading…</span>
      </div>
    );
  }

  if (!session) return <SignIn />;
  return children(session);
}

// Tapping the magic link from Mail always opens Safari, never the installed
// home-screen app (iOS has no deep-link mechanism into a standalone web app),
// so default installed-PWA users straight into the code flow instead.
const isStandalone =
  typeof window !== "undefined" &&
  (window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches);

function SignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");
  const [codeMode, setCodeMode] = useState(isStandalone); // type the emailed code instead of tapping the link
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const send = async () => {
    const addr = email.trim();
    if (!addr || !addr.includes("@")) return;
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: window.location.href },
    });
    if (error) {
      setErrorMsg(error.message);
      setState("error");
    } else {
      setCodeSent(true);
      setState("sent");
    }
  };

  // Redirect-free path: verifies a one-time code for this origin directly,
  // so it works even when the magic link would bounce to the wrong URL.
  const verifyCode = async () => {
    const addr = email.trim();
    const token = code.trim();
    if (!addr.includes("@") || !token) return;
    setState("sending");
    const { error } = await supabase.auth.verifyOtp({ email: addr, token, type: "email" });
    if (error) {
      setErrorMsg(error.message);
      setState("error");
    }
    // success: onAuthStateChange flips the gate, nothing to do here
  };

  // Once a code has actually been emailed, the codeMode button verifies it;
  // until then it still needs to trigger the initial send (same call as the
  // magic-link path — the email carries both the link and the code).
  const verifying = codeMode && codeSent;
  const primaryAction = verifying ? verifyCode : send;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#101214",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');
        input:focus { border-color: #6B7280 !important; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
          <Dumbbell size={24} color="#F5F6F7" strokeWidth={2.25} />
          <h1
            style={{
              fontFamily: "'Oswald', sans-serif",
              fontWeight: 700,
              fontSize: 28,
              letterSpacing: "0.04em",
              color: "#F5F6F7",
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Racked
          </h1>
        </div>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6B7280", margin: "0 0 24px" }}>
          Sign in to your training log
        </p>

        {state === "sent" && !codeMode && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#14321C",
              border: "1px solid #22C55E",
              borderRadius: 10,
              padding: "14px 16px",
              textAlign: "left",
              marginBottom: 12,
            }}
          >
            <Mail size={18} color="#22C55E" style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#F5F6F7" }}>
              Magic link sent to <strong>{email.trim()}</strong> — open it on this device.
            </span>
          </div>
        )}

        {codeMode && codeSent && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#14321C",
              border: "1px solid #22C55E",
              borderRadius: 10,
              padding: "14px 16px",
              textAlign: "left",
              marginBottom: 12,
            }}
          >
            <Mail size={18} color="#22C55E" style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#F5F6F7" }}>
              Code sent to <strong>{email.trim()}</strong> — enter it below (no need to leave the app).
            </span>
          </div>
        )}

        {state !== "sent" || codeMode ? (
          <>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && primaryAction()}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#1B1E22",
                border: "1px solid #2A2E33",
                borderRadius: 8,
                padding: "11px 12px",
                color: "#F5F6F7",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14,
                outline: "none",
                marginBottom: 10,
              }}
            />
            {codeMode && codeSent && (
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="one-time code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "#1B1E22",
                  border: "1px solid #2A2E33",
                  borderRadius: 8,
                  padding: "11px 12px",
                  color: "#F5F6F7",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 14,
                  outline: "none",
                  marginBottom: 10,
                  letterSpacing: "0.15em",
                }}
              />
            )}
            <button
              onClick={primaryAction}
              disabled={state === "sending"}
              style={{
                width: "100%",
                background: "#F5F6F7",
                color: "#101214",
                border: "none",
                borderRadius: 8,
                padding: "11px 12px",
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                opacity: state === "sending" ? 0.6 : 1,
              }}
            >
              {state === "sending"
                ? verifying
                  ? "Verifying…"
                  : "Sending…"
                : verifying
                ? "Verify code"
                : codeMode
                ? "Send code"
                : "Send magic link"}
            </button>
            {state === "error" && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#F5B4B4", marginTop: 10 }}>
                {errorMsg || "Something went wrong — try again."}
              </p>
            )}
          </>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setCodeMode(!codeMode);
            if (state === "error") setState("idle");
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "#6B7280",
            cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            marginTop: 14,
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          {codeMode ? "Use a magic link instead" : "Have a one-time code? Enter it instead"}
        </button>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { Users, UserPlus, Flame } from "lucide-react";
import { fetchBuddyStatus, redeemBuddyCode } from "./buddy.js";
import { loadBuddyCode, saveBuddyCode, deleteBuddyCode, unlinkBuddy } from "./storage.js";
import { makeBuddyCode, normalizeBuddyCode, buddyTodayLine } from "./buddyUtils.js";
import { StatBlock, SectionTitle as Header, CopyButton, ghostBtn, FONT_UI as FONT, FONT_MONO as MONO } from "./ui.jsx";

// Phase 14: the accountability corner of the Progress screen. A buddy sees
// presence — streak, sessions this week, "finished Push day ✓" — never
// weights or reps; the buddy-status edge function is the only data path.
// Fail-soft like Health/Notifications: no link, an undeployed function, or a
// not-yet-migrated database all render the mint/redeem setup, never a wall.

const hintText = { fontFamily: FONT, fontSize: 11.5, color: "#6B7280", lineHeight: 1.5 };
const errorText = { fontFamily: FONT, fontSize: 12, color: "#F5B4B4", marginTop: 8 };
const card = { background: "#1B1E22", border: "1px solid #2A2E33", borderRadius: 10, padding: "12px 14px" };

export default function BuddySection() {
  const [status, setStatus] = useState(undefined); // undefined loading · null unreachable · {linked, ...}
  const [code, setCode] = useState(undefined); // my pending invite code (unlinked only)
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBuddyStatus()
      .then(setStatus)
      .catch(() => setStatus(null)); // backend not deployed/reachable — show setup
    loadBuddyCode()
      .then(setCode)
      .catch(() => setCode(null));
  }, []);

  const mint = async () => {
    setBusy(true);
    setError(null);
    const next = makeBuddyCode(crypto.getRandomValues(new Uint8Array(8)));
    try {
      await saveBuddyCode(next);
      setCode(next);
    } catch {
      setError("Couldn't create a code — make sure the Phase 14 migration (buddy_codes + buddy_links) has run; see the README.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteBuddyCode();
      setCode(null);
    } catch {
      setError("Couldn't revoke — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    const normalized = normalizeBuddyCode(input);
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      const next = await redeemBuddyCode(normalized);
      setStatus(next);
      setInput("");
      setCode(null); // redeeming consumed both sides' pending codes
    } catch (err) {
      setError(String(err?.message || "Couldn't redeem the code — try again."));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (window.confirm && !window.confirm("Unlink from your buddy? Either of you can pair again with a new code.")) return;
    setBusy(true);
    setError(null);
    try {
      await unlinkBuddy();
      // Re-fetch instead of guessing: server truth also refreshes the
      // session-complete nudge's local flag.
      setStatus(await fetchBuddyStatus().catch(() => ({ linked: false })));
    } catch {
      setError("Couldn't unlink — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const linked = status?.linked ? status.buddy : null;

  return (
    <div>
      <Header icon={<Users size={15} color="#C4B5FD" />}>Buddy</Header>
      <div style={{ ...hintText, marginBottom: 10 }}>
        Accountability, not social: a buddy sees whether you showed up — streak, sessions this week, today's ✓ —
        never your weights or reps. One buddy each; either side can unlink.
      </div>

      {status === undefined ? null : linked ? (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: "#F5F6F7" }}>{linked.name}</span>
            <button
              type="button"
              onClick={unlink}
              disabled={busy}
              style={{ background: "transparent", border: "none", color: "#6B7280", cursor: "pointer", fontFamily: FONT, fontSize: 11.5, padding: "4px 2px" }}
            >
              Unlink
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <StatBlock label="current streak (weeks)" value={linked.streak} accent={linked.streak > 0 ? "#22C55E" : undefined} />
            <StatBlock label="this week" value={`${linked.weekSessions}/${linked.target}`} />
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: linked.today?.done ? "#22C55E" : linked.today?.sets ? "#FACC15" : "#6B7280",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Flame size={13} />
            {buddyTodayLine(linked.today)}
          </div>
        </div>
      ) : (
        <div>
          {code === undefined ? null : code === null ? (
            <button type="button" onClick={mint} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>
              <UserPlus size={13} />
              {busy ? "Working…" : "Create invite code"}
            </button>
          ) : (
            <div style={card}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                Your invite code — send it to your buddy
              </div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: "#F5F6F7", letterSpacing: "0.08em", marginBottom: 10 }}>
                {code}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <CopyButton text={code} label="Copy code" />
                <button
                  type="button"
                  onClick={revoke}
                  disabled={busy}
                  style={{ background: "transparent", border: "none", color: "#6B7280", cursor: "pointer", fontFamily: FONT, fontSize: 11.5, padding: "4px 2px", marginLeft: "auto" }}
                >
                  Revoke
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              type="text"
              placeholder="Buddy's code"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={{
                flex: 1,
                minWidth: 0,
                background: "#101214",
                border: "1px solid #2A2E33",
                borderRadius: 6,
                padding: "7px 8px",
                color: "#F5F6F7",
                fontFamily: MONO,
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={redeem}
              disabled={busy || !normalizeBuddyCode(input)}
              style={{ ...ghostBtn, opacity: busy || !normalizeBuddyCode(input) ? 0.6 : 1 }}
            >
              <Users size={13} />
              {busy ? "Working…" : "Link up"}
            </button>
          </div>
        </div>
      )}
      {error && <div style={errorText}>{error}</div>}
    </div>
  );
}

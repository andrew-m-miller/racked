// Racked push sender — Supabase Edge Function (Phase 10; buddy types Phase 14).
//
// One function, two callers, told apart by the (already-verified) JWT's role:
//   - the app, as a signed-in user: {type:"timer", seconds} — hold the
//     request's background task open and push "rest over" to that user's
//     devices after the delay. The service worker suppresses it when the app
//     is visible, so it only surfaces on a locked/backgrounded phone.
//     Also {type:"buddy-done", day} — fired once when a session completes;
//     resolves the caller's buddy_links row and tells the *buddy*'s devices
//     "<name> just finished <day> day". Day name only, never numbers.
//   - pg_cron, with the service role key as the bearer: {type:"weekly"} —
//     the Sunday-evening nudge to every subscription that a fresh check-in
//     is waiting (the client-side auto-coach builds the actual review).
//     Linked pairs who both hit their weekly target get the combo-streak
//     line folded in ("N weeks straight — both of you").
//
// JWT verification stays ON — both callers present a project-signed JWT.
//
// Secrets (npx supabase secrets set ...):
//   VAPID_KEYS    — JSON {publicKey, privateKey} JWK pair from
//                   scripts/generate-vapid-keys.mjs (its public half must be
//                   the same key the client builds with as VITE_VAPID_PUBLIC_KEY)
//   VAPID_CONTACT — optional mailto: for push services to reach the operator

import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";
import { underDailyCap } from "../_shared/quota.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = Deno.env.get("APP_URL") ?? "https://andrew-m-miller.github.io/racked/";

// The platform has already verified the signature (verify_jwt on); this just
// reads the claims back out to learn who's calling.
function jwtClaims(req: Request): { role?: string; sub?: string } {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^bearer /i, "");
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload));
  } catch {
    return {};
  }
}

type SubRow = { endpoint: string; keys: { p256dh: string; auth: string } };

// ---- buddy helpers (Phase 14) ----

// Display handle for the buddy-done push — the email's local part,
// capitalized (mirrors buddy-status; the app has no display-name concept).
function displayName(email: string | undefined | null): string {
  const local = String(email || "").split("@")[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "Your buddy";
}

// Monday-of-week / date arithmetic on YYYY-MM-DD keys, mirroring
// src/recap.js weekStart/shiftDays so streak weeks line up with the app's.
function weekStartKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function shiftDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Distinct-training-dates-per-week map + the user's streak target, the two
// inputs the combo streak needs. Dates only — no set-level data.
async function weeklyHits(admin: ReturnType<typeof createClient>, userId: string, today: string) {
  const horizon = shiftDays(today, -730); // ~2-year scan cap, same as buddy-status
  const [logsRes, planRes] = await Promise.all([
    admin.from("logs").select("date").eq("user_id", userId).gte("date", horizon).limit(20000),
    admin.from("plan").select("data").eq("user_id", userId).maybeSingle(),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (planRes.error) throw planRes.error;
  const plan = (planRes.data?.data ?? {}) as { meta?: { daysPerWeek?: number }; days?: unknown[] };
  const target = Number(plan.meta?.daysPerWeek) || (Array.isArray(plan.days) ? plan.days.length : 0) || 3;
  const perWeek = new Map<string, number>();
  for (const date of new Set((logsRes.data ?? []).map((r: { date: string }) => r.date))) {
    const k = weekStartKey(date as string);
    perWeek.set(k, (perWeek.get(k) || 0) + 1);
  }
  return { perWeek, target };
}

// user id → shared streak length, for every linked pair where *both* sides
// hit their own target every week of the run (counting the week that just
// ended — the cron fires Sunday evening, the last day of a Mon–Sun week).
async function comboStreaks(admin: ReturnType<typeof createClient>, today: string): Promise<Map<string, number>> {
  const combo = new Map<string, number>();
  const { data: links, error } = await admin.from("buddy_links").select("user_a, user_b");
  if (error) throw error;
  for (const link of (links ?? []) as { user_a: string; user_b: string }[]) {
    const [a, b] = await Promise.all([
      weeklyHits(admin, link.user_a, today),
      weeklyHits(admin, link.user_b, today),
    ]);
    let n = 0;
    let w = weekStartKey(today);
    while ((a.perWeek.get(w) || 0) >= a.target && (b.perWeek.get(w) || 0) >= b.target) {
      n++;
      w = shiftDays(w, -7);
    }
    if (n > 0) {
      combo.set(link.user_a, n);
      combo.set(link.user_b, n);
    }
  }
  return combo;
}

async function appServer() {
  const keys = Deno.env.get("VAPID_KEYS");
  if (!keys) throw new Error("VAPID_KEYS secret not set — run scripts/generate-vapid-keys.mjs (see README Phase 10)");
  const vapidKeys = await webpush.importVapidKeys(JSON.parse(keys), { extractable: false });
  return webpush.ApplicationServer.new({
    contactInformation: Deno.env.get("VAPID_CONTACT") ?? "mailto:admin@example.com",
    vapidKeys,
  });
}

// Send one payload to one subscription; prune the row if the push service
// says the subscription is gone (uninstalled PWA, revoked permission).
async function sendTo(
  admin: ReturnType<typeof createClient>,
  server: Awaited<ReturnType<typeof appServer>>,
  sub: SubRow,
  payload: Record<string, unknown>,
) {
  try {
    const subscriber = server.subscribe({ endpoint: sub.endpoint, keys: sub.keys });
    await subscriber.pushTextMessage(JSON.stringify(payload), {});
    return true;
  } catch (err) {
    if (err instanceof webpush.PushMessageError && err.isGone()) {
      await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    } else {
      console.error("push failed:", sub.endpoint.slice(0, 48), err);
    }
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { type, seconds, day } = await req.json().catch(() => ({}));
    const claims = jwtClaims(req);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (type === "timer") {
      if (claims.role !== "authenticated" || !claims.sub) {
        return Response.json({ error: "sign in required" }, { status: 401, headers: CORS });
      }
      // Each timer holds an isolate open for the delay, so cap the daily
      // volume per user — 200 covers the heaviest legitimate day (one call
      // per logged set + extensions) with a wide margin.
      if (!(await underDailyCap(admin, claims.sub, "push-timer", 200))) {
        return Response.json({ ok: false, error: "daily push limit reached" }, { headers: CORS });
      }
      const delay = Math.min(Math.max(Number(seconds) || 0, 5), 300); // rest timers live in this range; cap well under the 400s wall clock
      const { data: subs, error } = await admin
        .from("push_subscriptions")
        .select("endpoint, keys")
        .eq("user_id", claims.sub);
      if (error) throw error;
      if (!subs?.length) return Response.json({ ok: true, sent: 0 }, { headers: CORS });

      const payload = {
        title: "Rest over — next set",
        body: "Your rest timer just hit zero.",
        tag: "rest-timer", // extended timers collapse into one notification
        suppressIfVisible: true,
        url: APP_URL,
      };
      const run = (async () => {
        await new Promise((r) => setTimeout(r, delay * 1000));
        const server = await appServer();
        for (const sub of subs as SubRow[]) await sendTo(admin, server, sub, payload);
      })();
      // waitUntil keeps the isolate alive past the response; without it
      // (local serve), just hold the request open for the delay instead.
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(run);
      else await run;
      return Response.json({ ok: true, scheduled: delay, devices: subs.length }, { headers: CORS });
    }

    // Session-complete nudge to the caller's linked buddy (Phase 14). The
    // client fires this once per completed live session; no buddy link (or a
    // buddy with no subscriptions) is a quiet no-op, not an error.
    if (type === "buddy-done") {
      if (claims.role !== "authenticated" || !claims.sub) {
        return Response.json({ error: "sign in required" }, { status: 401, headers: CORS });
      }
      // One legit completion per plan day per day; 20 leaves room for
      // backdated re-completions and retries without letting a loop spam.
      if (!(await underDailyCap(admin, claims.sub, "push-buddy", 20))) {
        return Response.json({ ok: false, error: "daily buddy push limit reached" }, { headers: CORS });
      }
      const { data: link, error: linkErr } = await admin
        .from("buddy_links")
        .select("user_a, user_b")
        .or(`user_a.eq.${claims.sub},user_b.eq.${claims.sub}`)
        .maybeSingle();
      if (linkErr) throw linkErr;
      if (!link) return Response.json({ ok: true, sent: 0 }, { headers: CORS });
      const buddyId = link.user_a === claims.sub ? link.user_b : link.user_a;

      const { data: subs, error: subErr } = await admin
        .from("push_subscriptions")
        .select("endpoint, keys")
        .eq("user_id", buddyId);
      if (subErr) throw subErr;
      if (!subs?.length) return Response.json({ ok: true, sent: 0 }, { headers: CORS });

      const { data: caller } = await admin.auth.admin.getUserById(claims.sub);
      const name = displayName(caller?.user?.email);
      const dayName = typeof day === "string" && day.trim() ? day.trim().slice(0, 40) : null;
      const payload = {
        title: dayName ? `${name} just finished ${dayName} day` : `${name} just finished a workout`,
        body: "Your buddy showed up today.",
        tag: "buddy-done", // no suppressIfVisible — this one's news even with the app open
        url: APP_URL,
      };
      const server = await appServer();
      let sent = 0;
      for (const sub of subs as SubRow[]) if (await sendTo(admin, server, sub, payload)) sent++;
      return Response.json({ ok: true, sent }, { headers: CORS });
    }

    if (type === "weekly") {
      if (claims.role !== "service_role") {
        return Response.json({ error: "weekly nudge is cron-only" }, { status: 403, headers: CORS });
      }
      const { data: subs, error } = await admin.from("push_subscriptions").select("endpoint, keys, user_id");
      if (error) throw error;

      // Combo streak (Phase 14): linked pairs who both hit target get the
      // shared-streak line — the motivating mechanic. Fail-soft: a missing
      // buddy_links table just sends the plain nudge. The cron's UTC Sunday
      // date lands in the same Mon–Sun week as any US-timezone Sunday.
      let combo = new Map<string, number>();
      try {
        combo = await comboStreaks(admin, new Date().toISOString().slice(0, 10));
      } catch (err) {
        console.error("combo-streak skipped:", err);
      }

      const baseBody = "Your training week is wrapped — open Racked to see the coach's read.";
      const server = await appServer();
      let sent = 0;
      for (const sub of (subs ?? []) as (SubRow & { user_id: string })[]) {
        const n = combo.get(sub.user_id);
        const payload = {
          title: "Weekly check-in",
          body: n
            ? `${baseBody} Combo streak: ${n} week${n === 1 ? "" : "s"} straight — both of you hit target. 🔥`
            : baseBody,
          tag: "weekly-checkin",
          suppressIfVisible: true,
          url: `${APP_URL}#/progress`,
        };
        if (await sendTo(admin, server, sub, payload)) sent++;
      }
      return Response.json({ ok: true, sent }, { headers: CORS });
    }

    return Response.json({ error: "unknown type" }, { status: 400, headers: CORS });
  } catch (err) {
    console.error("push-send error:", err);
    return Response.json({ error: String((err as Error)?.message || err) }, { status: 500, headers: CORS });
  }
});

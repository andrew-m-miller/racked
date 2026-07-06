// Racked push sender — Supabase Edge Function (Phase 10).
//
// One function, two callers, told apart by the (already-verified) JWT's role:
//   - the app, as a signed-in user: {type:"timer", seconds} — hold the
//     request's background task open and push "rest over" to that user's
//     devices after the delay. The service worker suppresses it when the app
//     is visible, so it only surfaces on a locked/backgrounded phone.
//   - pg_cron, with the service role key as the bearer: {type:"weekly"} —
//     the Sunday-evening nudge to every subscription that a fresh check-in
//     is waiting (the client-side auto-coach builds the actual review).
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
    const { type, seconds } = await req.json().catch(() => ({}));
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

    if (type === "weekly") {
      if (claims.role !== "service_role") {
        return Response.json({ error: "weekly nudge is cron-only" }, { status: 403, headers: CORS });
      }
      const { data: subs, error } = await admin.from("push_subscriptions").select("endpoint, keys");
      if (error) throw error;
      const payload = {
        title: "Weekly check-in",
        body: "Your training week is wrapped — open Racked to see the coach's read.",
        tag: "weekly-checkin",
        suppressIfVisible: true,
        url: `${APP_URL}#/progress`,
      };
      const server = await appServer();
      let sent = 0;
      for (const sub of (subs ?? []) as SubRow[]) if (await sendTo(admin, server, sub, payload)) sent++;
      return Response.json({ ok: true, sent }, { headers: CORS });
    }

    return Response.json({ error: "unknown type" }, { status: 400, headers: CORS });
  } catch (err) {
    console.error("push-send error:", err);
    return Response.json({ error: String((err as Error)?.message || err) }, { status: 500, headers: CORS });
  }
});

// Racked health bridge — Supabase Edge Function (Phase 10).
//
// A web PWA can't touch HealthKit / Health Connect directly, so an Apple
// Shortcut (or any HTTP-capable automation) is the messenger:
//   POST {weight_lb, date?}  → imports a weigh-in into weigh_ins
//   GET  [?since=YYYY-MM-DD] → exports finished workouts for Log Workout
//
// Auth is a per-user sync token (sync_tokens table), minted in the app's
// Health sync section — Shortcuts can't hold a Supabase session, so JWT
// verification is OFF for this function. Deploy with:
//   npx supabase functions deploy health-sync --no-verify-jwt --project-ref <ref>
// The token arrives as ?token= or an Authorization: Bearer header and is
// resolved to a user with the service role; every read/write is then
// explicitly filtered to that user.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function tokenFrom(req: Request, url: URL): string {
  const header = req.headers.get("authorization") || "";
  if (/^bearer /i.test(header)) return header.slice(7).trim();
  return url.searchParams.get("token") || "";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = new URL(req.url);
    const token = tokenFrom(req, url);
    if (!token) return Response.json({ error: "missing token" }, { status: 401, headers: CORS });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row, error: tokErr } = await admin
      .from("sync_tokens")
      .select("user_id")
      .eq("token", token)
      .maybeSingle();
    if (tokErr) throw tokErr;
    if (!row) return Response.json({ error: "invalid token" }, { status: 401, headers: CORS });
    const userId = row.user_id;

    // ---- import: one weigh-in ----
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const weight = Math.round(Number(body?.weight_lb ?? body?.weight) * 10) / 10;
      if (!Number.isFinite(weight) || weight <= 0 || weight > 1500) {
        return Response.json({ error: "expected {weight_lb: number} in pounds" }, { status: 400, headers: CORS });
      }
      const date = typeof body?.date === "string" && DATE_RE.test(body.date)
        ? body.date
        : new Date().toISOString().slice(0, 10); // UTC fallback — Shortcuts should send the local date

      // Shortcut automations re-run; the identical weigh-in is a no-op, not a dupe.
      const { data: existing, error: dupErr } = await admin
        .from("weigh_ins")
        .select("id")
        .eq("user_id", userId)
        .eq("date", date)
        .eq("weight_lb", weight)
        .limit(1);
      if (dupErr) throw dupErr;
      if (existing?.length) return Response.json({ ok: true, skipped: true, date, weight_lb: weight }, { headers: CORS });

      const { error: insErr } = await admin.from("weigh_ins").insert({ user_id: userId, date, weight_lb: weight });
      if (insErr) throw insErr;
      return Response.json({ ok: true, date, weight_lb: weight }, { headers: CORS });
    }

    // ---- export: finished workouts ----
    if (req.method === "GET") {
      // Defaults to today only, so an evening automation can't re-log old
      // sessions; ?since= widens the window for a backfill.
      const today = new Date().toISOString().slice(0, 10);
      const sinceParam = url.searchParams.get("since");
      const since = sinceParam && DATE_RE.test(sinceParam) ? sinceParam : today;

      const { data: logs, error: logErr } = await admin
        .from("logs")
        .select("exercise_slug, date, reps")
        .eq("user_id", userId)
        .gte("date", since)
        .order("date", { ascending: true });
      if (logErr) throw logErr;

      const byDate = new Map<string, { sets: number; cardio_min: number }>();
      for (const l of logs ?? []) {
        const day = byDate.get(l.date) ?? { sets: 0, cardio_min: 0 };
        if (String(l.exercise_slug).startsWith("finisher")) day.cardio_min += Number(l.reps) || 0;
        else day.sets += 1;
        byDate.set(l.date, day);
      }
      const workouts = [...byDate.entries()].map(([date, d]) => ({
        date,
        sets: d.sets,
        lift_min: Math.round(d.sets * 2.5), // rough strength duration for Log Workout: ~2.5 min per set incl. rest
        cardio_min: Math.round(d.cardio_min),
        finisher_done: d.cardio_min > 0,
      }));
      return Response.json({ since, workouts }, { headers: CORS });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS });
  } catch (err) {
    console.error("health-sync error:", err);
    return Response.json({ error: String((err as Error)?.message || err) }, { status: 500, headers: CORS });
  }
});

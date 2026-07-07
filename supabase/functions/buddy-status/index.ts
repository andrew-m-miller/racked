// Racked buddy status — Supabase Edge Function (Phase 14).
//
// The one place the buddy-sharing contract is enforced: a linked user gets
// presence-level stats about their buddy — streak, sessions this week vs
// target, whether today's workout happened — never weights, reps, or any
// set-level data. The client has no RLS path to another user's rows, so even
// a buggy (or hostile) client can't read more than this function computes.
//
// Two actions, JWT verification ON (the caller is always a signed-in user):
//   {action:"status", today}        → {linked:false} | {linked:true, buddy:{...}}
//   {action:"redeem", code, today}  → redeems a buddy code minted by another
//                                     user, creates the buddy_links row, and
//                                     returns the same status payload.
// `today` is the caller's *local* YYYY-MM-DD (log dates are client-local, so
// the server's UTC clock would put evening sessions on the wrong day).
//
// Mint/unlink stay client-side: buddy_codes is an own-rows RLS table (the
// sync_tokens pattern) and either side may delete their buddy_links row.
// User-facing refusals (bad code, already linked) return 200 with {error} —
// same convention as the quota refusals; supabase-js buries non-2xx bodies.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { underDailyCap } from "../_shared/quota.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The platform has already verified the signature (verify_jwt on); this just
// reads the user id back out of the claims.
function jwtSub(req: Request): string | null {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^bearer /i, "");
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).sub ?? null;
  } catch {
    return null;
  }
}

// ---- date helpers (mirror src/recap.js weekStart/shiftDays) ----

function toDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Monday of the week containing dateStr — the same streak week the client's
// consistency section uses.
function weekStartKey(dateStr: string): string {
  const d = toDate(dateStr);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return toKey(d);
}

function shiftDays(dateStr: string, n: number): string {
  const d = toDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}

// Mirrors src/planUtils.js slug() so plan exercise names match log slugs.
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Current streak in weeks, matching ProgressView.computeStreaks: a streak
// week has `target`+ distinct training dates (Mon–Sun); the in-progress week
// counts if already at target but doesn't break the run while short.
function currentStreak(dates: Iterable<string>, today: string, target: number): number {
  const perWeek = new Map<string, number>();
  for (const date of new Set(dates)) {
    const k = weekStartKey(date);
    perWeek.set(k, (perWeek.get(k) || 0) + 1);
  }
  let streak = 0;
  let w = weekStartKey(today);
  if ((perWeek.get(w) || 0) >= target) streak++;
  w = shiftDays(w, -7);
  while ((perWeek.get(w) || 0) >= target) {
    streak++;
    w = shiftDays(w, -7);
  }
  return streak;
}

type PlanDay = { id: string; name: string; exercises: { name: string; sets: number; alts?: { name: string }[] }[] };

// Which plan day today's slugs vote for (majority, ties to earlier plan
// order — same rule as planUtils.buildDayIndex), and whether that day is
// complete: every exercise slot at its set count across primary+alts, plus
// the day's finisher. Counts only — no weights or reps ever leave here.
function todaySummary(days: PlanDay[], todaySlugs: string[]) {
  const counts = new Map<string, number>();
  for (const s of todaySlugs) counts.set(s, (counts.get(s) || 0) + 1);

  let liftSets = 0;
  for (const [s, n] of counts) if (!s.startsWith("finisher-")) liftSets += n;

  let winner: PlanDay | null = null;
  let bestVotes = 0;
  for (const d of days) {
    let votes = 0;
    for (const ex of d.exercises) {
      for (const name of [ex.name, ...(ex.alts || []).map((a) => a.name)]) {
        votes += counts.get(slugify(name)) || 0;
      }
    }
    votes += counts.get(`finisher-${String(d.id).toLowerCase()}`) || 0;
    if (votes > bestVotes) {
      bestVotes = votes;
      winner = d;
    }
  }

  let done = false;
  if (winner) {
    const finisherDone = (counts.get(`finisher-${String(winner.id).toLowerCase()}`) || 0) > 0;
    const liftsDone = winner.exercises.every((ex) => {
      const logged = [ex.name, ...(ex.alts || []).map((a) => a.name)].reduce(
        (n, name) => n + (counts.get(slugify(name)) || 0),
        0,
      );
      return logged >= (Number(ex.sets) || 1);
    });
    done = liftsDone && finisherDone;
  }

  return { sets: liftSets, dayName: winner?.name ?? null, done };
}

// A display handle from the auth record — the email's local part, capitalized.
// There's no profile/display-name concept anywhere else in the app.
function displayName(email: string | undefined | null): string {
  const local = String(email || "").split("@")[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "Your buddy";
}

// Streak scans read log *dates* only, capped at ~2 years — a longer streak
// renders as 104+ weeks, which nobody will mind.
const STREAK_HORIZON_DAYS = 730;

async function buddyStats(admin: SupabaseClient, buddyId: string, today: string) {
  const horizon = shiftDays(today, -STREAK_HORIZON_DAYS);
  const [datesRes, planRes, todayRes, userRes] = await Promise.all([
    admin.from("logs").select("date").eq("user_id", buddyId).gte("date", horizon).limit(20000),
    admin.from("plan").select("data").eq("user_id", buddyId).maybeSingle(),
    admin.from("logs").select("exercise_slug").eq("user_id", buddyId).eq("date", today),
    admin.auth.admin.getUserById(buddyId),
  ]);
  if (datesRes.error) throw datesRes.error;
  if (planRes.error) throw planRes.error;
  if (todayRes.error) throw todayRes.error;

  const plan = planRes.data?.data ?? {};
  const days: PlanDay[] = Array.isArray(plan.days) ? plan.days : [];
  // Same fallback chain as the client's streak target; 3 matches the seed.
  const target = Number(plan.meta?.daysPerWeek) || days.length || 3;

  const dates = (datesRes.data ?? []).map((r: { date: string }) => r.date);
  const weekDates = new Set(dates.filter((d) => d >= weekStartKey(today) && d <= today));

  return {
    name: displayName(userRes.data?.user?.email),
    streak: currentStreak(dates, today, target),
    weekSessions: weekDates.size,
    target,
    today: todaySummary(days, (todayRes.data ?? []).map((r: { exercise_slug: string }) => r.exercise_slug)),
  };
}

async function linkFor(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("buddy_links")
    .select("user_a, user_b, created_at")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function statusPayload(admin: SupabaseClient, userId: string, today: string) {
  const link = await linkFor(admin, userId);
  if (!link) return { linked: false };
  const buddyId = link.user_a === userId ? link.user_b : link.user_a;
  return { linked: true, since: link.created_at, buddy: await buddyStats(admin, buddyId, today) };
}

// Codes are stored canonically as XXXX-XXXX (see src/buddyUtils.js); accept
// pastes with any casing/spacing.
function normalizeCode(input: unknown): string | null {
  const raw = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const userId = jwtSub(req);
    if (!userId) return Response.json({ error: "sign in required" }, { status: 401, headers: CORS });

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const today = typeof body?.today === "string" && DATE_RE.test(body.today)
      ? body.today
      : new Date().toISOString().slice(0, 10); // UTC fallback — the app always sends its local date

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // No Anthropic spend here, but abuse symmetry with the other functions:
    // a generous cap that a real user can't hit (a handful of Progress-screen
    // opens a day) but a loop can.
    if (!(await underDailyCap(admin, userId, "buddy-status", 300))) {
      return Response.json({ error: "daily buddy-status limit reached — try again tomorrow" }, { headers: CORS });
    }

    if (action === "status") {
      return Response.json(await statusPayload(admin, userId, today), { headers: CORS });
    }

    if (action === "redeem") {
      const code = normalizeCode(body?.code);
      if (!code) return Response.json({ error: "that doesn't look like a buddy code" }, { headers: CORS });

      const { data: codeRow, error: codeErr } = await admin
        .from("buddy_codes")
        .select("user_id")
        .eq("code", code)
        .maybeSingle();
      if (codeErr) throw codeErr;
      if (!codeRow) return Response.json({ error: "code not found — check it with your buddy" }, { headers: CORS });
      if (codeRow.user_id === userId) return Response.json({ error: "that's your own code — send it to your buddy instead" }, { headers: CORS });

      // Exactly one buddy per user (the whole point of the design): refuse if
      // either side is already linked. The unique indexes on buddy_links back
      // this up against a redeem race.
      if (await linkFor(admin, userId)) return Response.json({ error: "you already have a buddy — unlink first" }, { headers: CORS });
      if (await linkFor(admin, codeRow.user_id)) {
        return Response.json({ error: "that user already has a buddy" }, { headers: CORS });
      }

      const [a, b] = [userId, codeRow.user_id].sort();
      const { error: insErr } = await admin.from("buddy_links").insert({ user_a: a, user_b: b });
      if (insErr) throw insErr;
      // Redeeming consumes the code; both sides' pending codes are stale now.
      await admin.from("buddy_codes").delete().in("user_id", [userId, codeRow.user_id]);

      return Response.json(await statusPayload(admin, userId, today), { headers: CORS });
    }

    return Response.json({ error: "unknown action" }, { status: 400, headers: CORS });
  } catch (err) {
    console.error("buddy-status error:", err);
    return Response.json({ error: String((err as Error)?.message || err) }, { status: 500, headers: CORS });
  }
});

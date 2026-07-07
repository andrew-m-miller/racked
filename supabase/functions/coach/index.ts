// Racked AI coach — Supabase Edge Function.
//
// Holds the Anthropic API key server-side (the app is a static GitHub Pages
// bundle, so the key can never ship to the client). The app sends the Tier 1
// weekly recap + the current plan; Claude returns a short narrative and
// concrete, one-tap-applicable plan tweaks as structured output.
//
// Deploy (either path):
//   dashboard: Edge Functions → Deploy a new function → paste this file,
//              then add the ANTHROPIC_API_KEY secret under Edge Functions → Secrets
//   cli:       npx supabase functions deploy coach --project-ref <ref>
//              npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// JWT verification stays ON (the default), so only signed-in app users can
// spend API credits — plus a per-user daily cap (../_shared/quota.ts), so a
// shared deployment can't be run up by one account. Deploying via the
// dashboard editor needs the _shared/quota.ts file added alongside; the CLI
// bundles it automatically.

import Anthropic from "npm:@anthropic-ai/sdk";
import { z } from "npm:zod";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jwtSub, underDailyCap } from "../_shared/quota.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CoachReview = z.object({
  narrative: z.string(), // 2-4 sentences: what went well, what's stalling, focus for next week
  suggestions: z.array(
    z.object({
      title: z.string(), // short imperative, e.g. "Hold Goblet Squat at 45 lb"
      detail: z.string(), // one sentence of why
      plan_change: z
        .object({
          exercise: z.string(), // must exactly match a plan exercise name
          sets: z.number().nullable(), // null = leave unchanged
          reps: z.string().nullable(), // null = leave unchanged
        })
        .nullable(), // null when the tip needs no plan edit (most progression advice)
      cycle_change: z
        .object({
          // Mesocycle edit (Phase 15), applied to plan meta client-side.
          // Null fields keep the current value; when no block exists yet,
          // all three should be set to propose one.
          lengthWeeks: z.number().nullable(), // total weeks per block, 2-12
          deloadWeeks: z.array(z.number()).nullable(), // 1-based weeks inside the block, usually the last
          startDate: z.string().nullable(), // YYYY-MM-DD Monday the (next) block starts
        })
        .nullable(), // null unless the block structure itself should change
    })
  ),
});

const SYSTEM = `You are a pragmatic strength coach reviewing one week of training
from "Racked", a workout tracker. The program's structure (day count, split,
cardio finishers) and the lifter's goal are described in the recap below —
adapt your advice to whatever it shows, and favor sustainable progress and
consistency over aggressiveness.

The app already auto-progresses loads (+5 lb upper / +10 lb lower at the rep
target, +5-10 sec on core holds, 10% deload after 2 straight misses, effort
ratings modulate this). Don't restate weight changes the app already suggests
unless you disagree — add value: consistency, exercise selection, set/rep scheme,
recovery, cardio dose.

The plan may run in mesocycles: repeating blocks of N weeks where listed
"deload weeks" are planned light weeks (~90% loads, excluded from the app's
miss counting). The MESOCYCLE section shows the current block state, or that
none is configured. A cycle_change suggestion edits it: adjust lengthWeeks,
move deloadWeeks, or set startDate (a Monday — use the dates in the MESOCYCLE
section) to start the next block fresh. Null fields keep their current value.
For a consistent, experienced lifter with no block, you may propose one
(typically 4 weeks, deload on week 4, starting next Monday). At most one
cycle_change per review, and only when the training pattern warrants it —
e.g. accumulating fatigue, a finished block, or a deload placed badly.

Respond with a short narrative (2-4 sentences) and 2-4 concrete suggestions.
Only include a plan_change when a structural edit to the plan is clearly
warranted (changing sets or the rep target of an exercise); its "exercise" field
must exactly match a name from the CURRENT PLAN section. Never invent exercises.
A suggestion carries at most one of plan_change / cycle_change.`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// UTC date math over client-local YYYY-MM-DD strings — the strings carry the
// caller's calendar, so no timezone conversion may happen here.
function mondayOf(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

function addDays(d: Date, n: number): string {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next.toISOString().slice(0, 10);
}

// The MESOCYCLE context block: today's anchors plus the block state, so the
// model can place cycle_change dates without guessing the caller's calendar.
function cycleText(plan: { cycle?: { lengthWeeks: number; deloadWeeks: number[]; startDate: string } }, today: string | null): string {
  const lines: string[] = [];
  if (today) {
    const monday = mondayOf(today);
    lines.push(`Today is ${today}; this training week started Monday ${addDays(monday, 0)}; the next block could start Monday ${addDays(monday, 7)}.`);
  }
  const c = plan?.cycle;
  const lengthWeeks = Number(c?.lengthWeeks);
  const deloadWeeks = Array.isArray(c?.deloadWeeks) ? c.deloadWeeks.map(Number).filter(Number.isInteger) : [];
  if (!Number.isInteger(lengthWeeks) || lengthWeeks < 2 || !deloadWeeks.length || typeof c?.startDate !== "string" || !DATE_RE.test(c.startDate)) {
    lines.push("No mesocycle is configured — training is linear.");
    return lines.join("\n");
  }
  lines.push(`Block: ${lengthWeeks} weeks repeating, deload on week ${deloadWeeks.join(" and ")}, started ${c.startDate}.`);
  if (today) {
    const diff = Math.round((mondayOf(today).getTime() - mondayOf(c.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (diff >= 0) {
      const week = (diff % lengthWeeks) + 1;
      lines.push(`This week is week ${week} of ${lengthWeeks}${deloadWeeks.includes(week) ? " — a planned deload week" : ""}.`);
    }
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { recap, plan, today } = await req.json();
    if (!recap || typeof recap !== "string") {
      return Response.json({ error: "missing recap" }, { status: 400, headers: CORS });
    }
    // A real recap is a few KB; anything bigger is input-token amplification.
    if (recap.length > 20000) {
      return Response.json({ error: "recap too large" }, { status: 400, headers: CORS });
    }

    const userId = jwtSub(req);
    if (!userId) {
      return Response.json({ error: "sign in required" }, { status: 401, headers: CORS });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // 200 with {error} rather than 429: supabase-js buries non-2xx bodies, and
    // the client already surfaces data.error verbatim.
    if (!(await underDailyCap(admin, userId, "coach", 10))) {
      return Response.json({ error: "Daily coach limit reached — try again tomorrow." }, { headers: CORS });
    }

    const planText = (plan?.days || [])
      .slice(0, 7)
      .map(
        (d: { name: string; exercises: { name: string; sets: number; reps: string }[] }) =>
          `${d.name}: ${d.exercises.map((e) => `${e.name} (${e.sets}×${e.reps})`).join(", ")}`
      )
      .join("\n")
      .slice(0, 8000);

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const response = await client.messages.parse({
      // Sonnet 5: a fifth to a third of Opus pricing while keeping adaptive
      // thinking and structured outputs — the sweet spot for a weekly review.
      model: "claude-sonnet-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `CURRENT PLAN\n${planText}\n\nMESOCYCLE\n${cycleText(plan, typeof today === "string" && DATE_RE.test(today) ? today : null)}\n\nTHIS WEEK\n${recap}`,
        },
      ],
      output_config: { format: zodOutputFormat(CoachReview) },
    });

    if (!response.parsed_output) {
      return Response.json({ error: "coach response could not be parsed" }, { status: 502, headers: CORS });
    }
    return Response.json(response.parsed_output, { headers: CORS });
  } catch (err) {
    console.error("coach error:", err);
    return Response.json({ error: String(err?.message || err) }, { status: 500, headers: CORS });
  }
});

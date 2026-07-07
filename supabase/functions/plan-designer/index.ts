// Racked AI plan designer — Supabase Edge Function.
//
// Turns a short goals form (goal / experience / days per week / equipment /
// free-text constraints) into a complete 2–5-day workout plan: exercises with
// sets/reps/starting weights, two alternates each, and a cardio finisher per
// day. Claude only proposes names and numbers; ids, labels, plate colors, and
// YouTube search-link URLs are constructed here so they're guaranteed valid.
// A second function (find-videos) later upgrades primaries to real videos.
//
// Deploy (either path):
//   dashboard: Edge Functions → Deploy a new function → paste this file,
//              the ANTHROPIC_API_KEY secret is shared with `coach`
//   cli:       npx supabase functions deploy plan-designer --project-ref <ref>
//
// JWT verification stays ON (the default), so only signed-in app users can
// spend API credits — plus a per-user daily cap (../_shared/quota.ts); this
// is the priciest function per call, so it gets the tightest one.

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

const GOALS = ["strength", "muscle", "fat_loss", "general"];
const EXPERIENCES = ["new", "returning", "experienced"];
const EQUIPMENT = ["full_gym", "dumbbells_bench", "bodyweight"];

const GOAL_LABEL: Record<string, string> = {
  strength: "build strength",
  muscle: "build muscle",
  fat_loss: "fat loss while building strength",
  general: "general fitness",
};

// Fixed per-day palette; first three match the bundled seed plan's plates.
const PLATES = ["#3B82F6", "#FACC15", "#22C55E", "#E8967A", "#B9A6E0"];

// The model only proposes names and numbers — ids/labels/plates/urls are
// assembled post-parse. No numeric constraints in the schema (structured
// outputs strip them); ranges are enforced via the prompt + clamping below.
// Equipment tags (Phase 13) drive the app's travel-mode profile matching —
// same fixed vocabulary as src/equipment.js. Old plan rows without them fall
// back to a client-side name guess, so the field is additive.
const Equip = z.enum(["barbell", "dumbbell", "machine", "cable", "bodyweight"]);
const Alt = z.object({ name: z.string(), start: z.string(), equip: Equip });
const Exercise = z.object({
  name: z.string(),
  cat: z.enum(["Upper", "Lower", "Core"]),
  sets: z.number(),
  reps: z.string(),
  start: z.string(),
  equip: Equip,
  alts: z.array(Alt),
});
const Day = z.object({ name: z.string(), finisher: z.string(), exercises: z.array(Exercise) });
const DesignedPlan = z.object({ summary: z.string(), days: z.array(Day) });

// Same slug rule as the app's planUtils.js — exercise names become history
// keys, so every name must survive slugging.
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function searchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(name + " form")}`;
}

// The app's progression engine parses these fields, so the format rules are
// load-bearing, not stylistic — see progression.js targetNumber/startNumber
// and planUtils.js isTimeBased/isBodyweightEx in the repo.
const SYSTEM = `You are an expert strength coach designing a weekly workout plan for the
"Racked" tracking app. Respond with a short summary (2-3 sentences, addressed
to the lifter) and the plan days.

Hard format rules — the app parses these fields mechanically:
- Every "reps" string's LAST number is the progression target (e.g. "12",
  "8–10", "10/leg"). Timed core holds MUST contain "sec" (e.g. "30–45 sec").
- Every "start" must contain a parsable number for weighted moves (e.g.
  "30–35 lb DB", "70–90 lb") or be exactly "Bodyweight" for unweighted moves.
- "cat" is Upper, Lower, or Core. The app auto-progresses +5 lb upper /
  +10 lb lower at the rep target, +5-10 sec on core holds.
- "equip" tags what the move needs: barbell, dumbbell, machine, cable, or
  bodyweight. Tag by the required apparatus, not the load — a hanging knee
  raise or back-extension bench is "machine" even though it logs bodyweight.
  The app uses these to bulk-swap sessions when the user is travelling, so
  where sensible give each weighted lift at least one dumbbell or bodyweight
  alternate.

Plan structure rules:
- Produce EXACTLY the requested number of days — no more, no fewer. This is
  the most important rule; a plan with the wrong day count is rejected.
- 5–7 exercises per day, sets 2–4, a sensible split for the day count
  (full-body for 2–3 days, upper/lower or push/pull/legs beyond that).
- Each day ends with a cardio finisher: one line with a duration, e.g.
  "12–15 min incline treadmill walk or bike intervals".
- EXACTLY 2 alternates per exercise, drawn from the same equipment pool and
  hitting the same movement pattern (for when a machine is taken).
- Respect the equipment strictly: "bodyweight" means no external load
  anywhere, including alternates. "dumbbells_bench" means dumbbells and an
  adjustable bench only.
- Treat constraints/injuries as "work around, never aggravate".
- Pick conservative starting weights for new or returning lifters.
- Use common, searchable exercise names — they become progress-history keys
  and YouTube search queries, so no invented or overly clever names.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const body = await req.json();
    const { goal, experience, equipment } = body;
    if (!GOALS.includes(goal)) {
      return Response.json({ error: "invalid goal" }, { status: 400, headers: CORS });
    }
    if (!EXPERIENCES.includes(experience)) {
      return Response.json({ error: "invalid experience" }, { status: 400, headers: CORS });
    }
    if (!EQUIPMENT.includes(equipment)) {
      return Response.json({ error: "invalid equipment" }, { status: 400, headers: CORS });
    }

    const userId = jwtSub(req);
    if (!userId) {
      return Response.json({ error: "sign in required" }, { status: 401, headers: CORS });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // 200 with {error}: the client renders data.error in its error box.
    if (!(await underDailyCap(admin, userId, "plan-designer", 10))) {
      return Response.json({ error: "Daily plan-designer limit reached — try again tomorrow." }, { headers: CORS });
    }

    const daysPerWeek = Math.min(5, Math.max(2, Number(body.daysPerWeek) || 3));
    const constraints = typeof body.constraints === "string" ? body.constraints.slice(0, 500) : "";
    const tweak = typeof body.tweak === "string" ? body.tweak.slice(0, 300) : "";
    const previousDays = Array.isArray(body.previousDays)
      ? body.previousDays.filter((d: unknown) => typeof d === "string").slice(0, 5)
      : [];

    const requestLines = [
      `Goal: ${GOAL_LABEL[goal]}`,
      `Experience: ${experience}`,
      `Days per week: ${daysPerWeek} — the plan must have exactly ${daysPerWeek} days`,
      `Equipment: ${equipment}`,
    ];
    if (constraints) requestLines.push(`Constraints/injuries: ${constraints}`);
    if (tweak || previousDays.length) {
      requestLines.push(
        `The user rejected a previous plan (days: ${previousDays.join(", ") || "unknown"})` +
          `${tweak ? ` with this note: "${tweak}"` : ""} — produce a meaningfully different plan that honors it.`
      );
    }

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const response = await client.messages.parse({
      // Sonnet 5, same as coach: plenty of design quality at a fraction of
      // Opus pricing, and generation stays in the 30-60s range.
      model: "claude-sonnet-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{ role: "user", content: requestLines.join("\n") }],
      output_config: { format: zodOutputFormat(DesignedPlan) },
    });

    if (!response.parsed_output) {
      return Response.json({ error: "plan could not be parsed — try again" }, { status: 502, headers: CORS });
    }
    const plan = response.parsed_output;

    // Post-parse validation: no server retry loop — the client's Regenerate
    // button is the retry path.
    if (plan.days.length !== daysPerWeek) {
      return Response.json({ error: "wrong number of days — try again" }, { status: 502, headers: CORS });
    }
    for (const day of plan.days) {
      if (day.exercises.length < 4) {
        return Response.json({ error: "a day came back too thin — try again" }, { status: 502, headers: CORS });
      }
      for (const ex of day.exercises) {
        if (!slugify(ex.name) || ex.alts.some((a) => !slugify(a.name))) {
          return Response.json({ error: "an exercise name was unusable — try again" }, { status: 502, headers: CORS });
        }
      }
    }

    // Assemble the app's plan shape: ids are letters by index (slug-safe, so
    // finisher-a/-b/... history keeps resolving), urls are guaranteed-valid
    // search links that find-videos upgrades in the background.
    const days = plan.days.map((day, i) => ({
      id: "ABCDE"[i],
      label: `Day ${i + 1}`,
      name: day.name,
      plate: PLATES[i],
      finisher: day.finisher,
      exercises: day.exercises.map((ex) => ({
        name: ex.name,
        cat: ex.cat,
        sets: Math.min(5, Math.max(1, Math.round(ex.sets))),
        reps: ex.reps,
        start: ex.start,
        equip: ex.equip,
        url: searchUrl(ex.name),
        alts: ex.alts.map((a) => ({ name: a.name, start: a.start, equip: a.equip, url: searchUrl(a.name) })),
      })),
    }));

    const meta: Record<string, unknown> = {
      goal,
      daysPerWeek,
      experience,
      description: `${daysPerWeek}-day plan, ${daysPerWeek} sessions/week + cardio finisher each session. Goal: ${GOAL_LABEL[goal]}.`,
    };
    // Experienced lifters get a proposed mesocycle (Phase 15): 4-week block,
    // week 4 the planned deload. startDate is deliberately absent — log dates
    // are client-local, so the app stamps its own Monday on accept; until
    // then the cycle is inert (every read site requires a valid startDate).
    if (experience === "experienced") {
      meta.cycle = { lengthWeeks: 4, deloadWeeks: [4] };
    }

    return Response.json({ summary: plan.summary, meta, days }, { headers: CORS });
  } catch (err) {
    console.error("plan-designer error:", err);
    return Response.json({ error: String(err?.message || err) }, { status: 500, headers: CORS });
  }
});

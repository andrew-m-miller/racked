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
// spend API credits.

import Anthropic from "npm:@anthropic-ai/sdk";
import { z } from "npm:zod";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";

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
    })
  ),
});

const SYSTEM = `You are a pragmatic strength coach reviewing one week of training
from "Racked", a 3-day alternating full-body program (days A/B/C, 3 sessions/week,
each ending in a cardio finisher). The lifter's goal is fat loss while building
strength; they are returning after a long layoff, so favor sustainable progress
and consistency over aggressiveness.

The app already auto-progresses loads (+5 lb upper / +10 lb lower at the rep
target, +5-10 sec on core holds, 10% deload after 2 straight misses, effort
ratings modulate this). Don't restate weight changes the app already suggests
unless you disagree — add value: consistency, exercise selection, set/rep scheme,
recovery, cardio dose.

Respond with a short narrative (2-4 sentences) and 2-4 concrete suggestions.
Only include a plan_change when a structural edit to the plan is clearly
warranted (changing sets or the rep target of an exercise); its "exercise" field
must exactly match a name from the CURRENT PLAN section. Never invent exercises.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { recap, plan } = await req.json();
    if (!recap || typeof recap !== "string") {
      return Response.json({ error: "missing recap" }, { status: 400, headers: CORS });
    }

    const planText = (plan?.days || [])
      .map(
        (d: { name: string; exercises: { name: string; sets: number; reps: string }[] }) =>
          `${d.name}: ${d.exercises.map((e) => `${e.name} (${e.sets}×${e.reps})`).join(", ")}`
      )
      .join("\n");

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `CURRENT PLAN\n${planText}\n\nTHIS WEEK\n${recap}`,
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

// Racked video finder — Supabase Edge Function.
//
// Upgrades primary exercises' YouTube search links to real hand-picked
// tutorial videos. Runs in the background while the user reviews an
// AI-designed plan: Claude's web-search server tool finds one form-tutorial
// video per exercise, results are validated to real watch?v= URLs and cached
// in the video_links table so regenerations and common exercises are
// instant/free. Best-effort by design — anything unresolved keeps its search
// link in the app.
//
// Deploy (either path):
//   dashboard: Edge Functions → Deploy a new function → paste this file,
//              the ANTHROPIC_API_KEY secret is shared with `coach`
//   cli:       npx supabase functions deploy find-videos --project-ref <ref>
//
// JWT verification stays ON (the default). The video_links cache is read and
// written with the service-role key (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// are auto-injected into every edge function — no extra secret to set).

import Anthropic from "npm:@anthropic-ai/sdk";
import { z } from "npm:zod";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { createClient } from "npm:@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Videos = z.object({
  videos: z.array(
    z.object({
      name: z.string(), // must echo the exercise name it was given
      url: z.string(), // direct https://www.youtube.com/watch?v=... URL from search results
      title: z.string(),
    })
  ),
});

const SYSTEM = `For each exercise you're given, run one web search like
"<name> form tutorial youtube" and pick the single best form-tutorial video —
a reputable strength-training channel, clearly about that exact exercise.
Return the exact watch URL from the search results; NEVER construct or guess
a video ID. If no good result turns up for an exercise, omit it.`;

// Same slug rule as the app's planUtils.js — the cache is keyed the same way
// the app keys exercise history.
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Accept only real YouTube watch URLs (or youtu.be short links, normalized).
// Anything else is dropped — the client keeps its search-link fallback.
const WATCH_RE = /^https:\/\/(www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/;
const SHORT_RE = /^https:\/\/(www\.)?youtu\.be\/([A-Za-z0-9_-]{11})/;

function normalizeUrl(url: string): string | null {
  const watch = url.match(WATCH_RE);
  if (watch) return `https://www.youtube.com/watch?v=${watch[2]}`;
  const short = url.match(SHORT_RE);
  if (short) return `https://www.youtube.com/watch?v=${short[2]}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { exercises } = await req.json();
    if (!Array.isArray(exercises) || exercises.length === 0) {
      return Response.json({ error: "missing exercises" }, { status: 400, headers: CORS });
    }

    // Dedupe by slug, cap the batch — a plan tops out around 35 primaries.
    const bySlug = new Map<string, string>();
    for (const name of exercises.slice(0, 40)) {
      if (typeof name !== "string") continue;
      const key = slugify(name);
      if (key && !bySlug.has(key)) bySlug.set(key, name);
    }
    if (bySlug.size === 0) {
      return Response.json({ error: "missing exercises" }, { status: 400, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Cache first: anything already found is returned without searching.
    const videos: Record<string, { url: string; title: string | null }> = {};
    const { data: cached } = await supabase
      .from("video_links")
      .select("slug, url, title")
      .in("slug", [...bySlug.keys()]);
    for (const row of cached ?? []) {
      videos[row.slug] = { url: row.url, title: row.title };
      bySlug.delete(row.slug);
    }

    // Search for the rest. Errors mid-search still return whatever resolved —
    // this endpoint is best-effort by design.
    if (bySlug.size > 0) {
      try {
        const names = [...bySlug.values()];
        const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
        const request = {
          model: "claude-sonnet-5",
          max_tokens: 8000,
          thinking: { type: "adaptive" as const },
          tools: [{ type: "web_search_20260209" as const, name: "web_search", max_uses: names.length + 5 }],
          system: SYSTEM,
          output_config: { format: zodOutputFormat(Videos) },
        };
        let messages: Anthropic.MessageParam[] = [
          { role: "user", content: `Find one form-tutorial video for each of these exercises:\n${names.join("\n")}` },
        ];
        let response = await client.messages.parse({ ...request, messages });

        // The server-tool loop pauses roughly every 10 searches with
        // stop_reason "pause_turn" — append the assistant turn and re-call to
        // resume. Bounded so a wedged loop can't burn the wall clock.
        let continuations = 0;
        while (response.stop_reason === "pause_turn" && continuations < 6) {
          messages = [...messages, { role: "assistant", content: response.content }];
          response = await client.messages.parse({ ...request, messages });
          continuations += 1;
        }

        const found = response.parsed_output?.videos ?? [];
        const rows: { slug: string; url: string; title: string }[] = [];
        for (const video of found) {
          const key = slugify(video.name);
          const url = normalizeUrl(video.url);
          if (!key || !bySlug.has(key) || !url) continue;
          videos[key] = { url, title: video.title };
          rows.push({ slug: key, url, title: video.title });
        }
        if (rows.length > 0) await supabase.from("video_links").upsert(rows);
      } catch (err) {
        console.error("find-videos search error:", err);
      }
    }

    return Response.json({ videos }, { headers: CORS });
  } catch (err) {
    console.error("find-videos error:", err);
    return Response.json({ error: String(err?.message || err) }, { status: 500, headers: CORS });
  }
});

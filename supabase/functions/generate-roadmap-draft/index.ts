// generate-roadmap-draft — ADMIN ONLY.
//
// Produces a draft roadmap (steps + milestones + suggested free resources) as
// JSON for the admin to review and edit before inserting into the database.
// It never writes to the database itself.
//
// Secrets: ANTHROPIC_API_KEY, ADMIN_USER_IDS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { checkRateLimit, clientIp, isAdmin } from "../_shared/rateLimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "Not signed in." }, 401);
    }
    if (!isAdmin(userData.user.id)) {
      return jsonResponse({ error: "Admin access required." }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Tight limit: drafts are expensive. 3 per admin per 10 minutes, 5 per IP.
    const rl = await checkRateLimit(
      admin,
      "generate-roadmap-draft",
      userData.user.id,
      clientIp(req),
      { userLimit: 3, ipLimit: 5, windowSeconds: 600 },
    );
    if (!rl.allowed) return jsonResponse({ error: rl.reason }, 429);

    const body = await req.json().catch(() => ({}));
    const skillTitle =
      typeof body.skill_title === "string" ? body.skill_title.slice(0, 100) : null;
    const stepCount = Math.min(Math.max(Number(body.step_count) || 12, 5), 20);
    if (!skillTitle) {
      return jsonResponse({ error: "skill_title is required." }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "AI provider key is not configured." }, 500);
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content:
              `Design a beginner learning roadmap for the skill: "${skillTitle}".\n` +
              `Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly:\n` +
              `{"steps":[{"order_index":1,"title":"","description":"","ai_explanation":"","estimated_hours":0,` +
              `"resources":[{"title":"","url":"","type":"video|article|doc","is_free":true,"source":""}]}],` +
              `"milestones":[{"order_index":1,"title":"","description":"","after_step_order_index":0}]}\n` +
              `Rules: exactly ${stepCount} steps in logical order for a total beginner; ` +
              `2-3 well-known FREE resources per step (real, reputable URLs only — MDN, freeCodeCamp, ` +
              `official docs, The Odin Project, javascript.info, YouTube); ` +
              `ai_explanation is 3-5 encouraging plain sentences; 2-4 milestones placed after natural checkpoints.`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error("AI provider error:", detail);
      return jsonResponse({ error: "AI provider request failed." }, 502);
    }

    const aiData = await aiRes.json();
    const raw: string = (aiData.content ?? [])
      .map((c: { type: string; text?: string }) => (c.type === "text" ? c.text : ""))
      .filter(Boolean)
      .join("\n")
      .replace(/```json|```/g, "")
      .trim();

    let draft: unknown;
    try {
      draft = JSON.parse(raw);
    } catch {
      return jsonResponse(
        { error: "AI returned malformed JSON.", raw },
        502,
      );
    }

    return jsonResponse({
      skill_title: skillTitle,
      draft,
      note: "Review and edit this draft, then insert it into the database yourself. Nothing has been saved.",
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Unexpected server error." }, 500);
  }
});

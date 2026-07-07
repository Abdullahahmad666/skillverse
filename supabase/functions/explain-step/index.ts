// explain-step — returns the explanation for a roadmap step.
//
// V1 policy: explanations are generated ONCE, reviewed by the admin, and
// stored in roadmap_steps.ai_explanation. For normal users this function
// simply returns the stored text. Only an admin (ADMIN_USER_IDS secret) can
// force a fresh AI generation, review it, and persist it with save=true.
//
// Secrets used (set via `supabase secrets set`): ANTHROPIC_API_KEY, ADMIN_USER_IDS.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// The AI key never leaves this function.

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
    const user = userData.user;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limit: 10 calls per user per minute, 30 per IP per minute.
    const rl = await checkRateLimit(admin, "explain-step", user.id, clientIp(req), {
      userLimit: 10,
      ipLimit: 30,
      windowSeconds: 60,
    });
    if (!rl.allowed) return jsonResponse({ error: rl.reason }, 429);

    const body = await req.json().catch(() => ({}));
    const stepId = typeof body.step_id === "string" ? body.step_id : null;
    const regenerate = body.regenerate === true;
    const save = body.save === true;
    if (!stepId || !/^[0-9a-f-]{36}$/i.test(stepId)) {
      return jsonResponse({ error: "A valid step_id is required." }, 400);
    }

    const { data: step, error: stepError } = await admin
      .from("roadmap_steps")
      .select("id, title, description, ai_explanation, skills ( title )")
      .eq("id", stepId)
      .single();
    if (stepError || !step) {
      return jsonResponse({ error: "Step not found." }, 404);
    }

    // Normal path: serve the stored, reviewed explanation.
    if (step.ai_explanation && !regenerate) {
      return jsonResponse({ explanation: step.ai_explanation, source: "stored" });
    }

    // Generating (or regenerating) is admin-only in V1.
    if (!isAdmin(user.id)) {
      if (step.ai_explanation) {
        return jsonResponse({ explanation: step.ai_explanation, source: "stored" });
      }
      return jsonResponse(
        { error: "This step's explanation hasn't been published yet." },
        404,
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "AI provider key is not configured." }, 500);
    }

    const skillTitle =
      (step as { skills?: { title?: string } | { title?: string }[] }).skills instanceof Array
        ? ((step as { skills: { title?: string }[] }).skills[0]?.title ?? "this skill")
        : ((step as { skills?: { title?: string } }).skills?.title ?? "this skill");

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content:
              `You write short explanations for a beginner learning roadmap.\n` +
              `Skill: ${skillTitle}\nStep: ${step.title}\nStep summary: ${step.description ?? ""}\n\n` +
              `Write 3-5 encouraging, plain-language sentences explaining what this step is, ` +
              `why it matters in the journey, and one practical tip for learning it. ` +
              `No headings, no lists, no markdown — one paragraph of plain text only.`,
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
    const explanation: string = (aiData.content ?? [])
      .map((c: { type: string; text?: string }) => (c.type === "text" ? c.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!explanation) {
      return jsonResponse({ error: "AI returned an empty response." }, 502);
    }

    if (save) {
      const { error: saveError } = await admin
        .from("roadmap_steps")
        .update({ ai_explanation: explanation })
        .eq("id", stepId);
      if (saveError) {
        return jsonResponse({ error: "Generated, but saving failed." }, 500);
      }
    }

    return jsonResponse({ explanation, source: "generated", saved: save });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Unexpected server error." }, 500);
  }
});

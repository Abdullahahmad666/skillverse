// explain-step — returns the explanation for a roadmap step.
//
// V1 policy: explanations are generated ONCE, reviewed by the admin, and
// stored in roadmap_steps.ai_explanation. For normal users this function
// simply returns the stored text. Only an admin (ADMIN_USER_IDS secret) can
// force a fresh AI generation, review it, and persist it with save=true.
//
// Secrets used (set via `supabase secrets set`): OPENROUTER_API_KEY, ADMIN_USER_IDS.
// Optional: OPENROUTER_MODEL (defaults to "openrouter/free").
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// The AI key never leaves this function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { checkRateLimit, clientIp, isAdmin } from "../_shared/rateLimit.ts";

// OpenRouter — OpenAI-compatible chat completions. "openrouter/free" auto-routes
// to a free model; override with the OPENROUTER_MODEL secret to pin a specific
// one (e.g. "google/gemini-2.0-flash-exp:free").
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = Deno.env.get("OPENROUTER_MODEL")?.trim() || "openrouter/free";

/**
 * Calls OpenRouter's chat/completions endpoint and returns the plain-text
 * output. On an HTTP error it returns { ok: false, detail } so the caller can
 * log the detail server-side and reply with a safe generic message.
 */
async function callLLM(
  apiKey: string,
  prompt: string,
  maxTokens: number,
): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      // Optional attribution (shown on OpenRouter's dashboard/rankings).
      "X-Title": "SkillVerse",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      // Some free models are reasoning models; exclude the chain-of-thought so
      // only the final answer comes back in `content`.
      reasoning: { exclude: true },
    }),
  });
  if (!res.ok) {
    return { ok: false, detail: `HTTP ${res.status}: ${await res.text()}` };
  }
  const data = await res.json();
  // Defense-in-depth: if a reasoning model still leaks <think>…</think> into
  // the content, drop it and keep only the answer.
  const text: string = (data?.choices?.[0]?.message?.content ?? "")
    .toString()
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  // A 200 with no text usually means a token cutoff or a provider-side error
  // (e.g. a free model temporarily unavailable). Surface the raw response so
  // the reason is visible in the logs instead of a silent 502.
  if (!text) {
    return {
      ok: false,
      detail: `empty text from OpenRouter (HTTP ${res.status}): ${JSON.stringify(data)}`,
    };
  }
  return { ok: true, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", "Method not allowed.", 405);
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
      return errorResponse("unauthorized", "Not signed in.", 401);
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
    if (!rl.allowed) return errorResponse("rate_limited", rl.reason ?? "Too many requests.", 429);

    const body = await req.json().catch(() => ({}));
    const stepId = typeof body.step_id === "string" ? body.step_id : null;
    const regenerate = body.regenerate === true;
    const save = body.save === true;
    // Learner modes (any signed-in user): a simpler re-explanation, or a
    // short ungraded quiz. Results are never persisted.
    const mode =
      body.mode === "simplify" || body.mode === "quiz" ? body.mode : null;
    if (!stepId || !/^[0-9a-f-]{36}$/i.test(stepId)) {
      return errorResponse("invalid_input", "A valid step_id is required.", 400);
    }

    const { data: step, error: stepError } = await admin
      .from("roadmap_steps")
      .select("id, title, description, ai_explanation, skills ( title )")
      .eq("id", stepId)
      .single();
    if (stepError || !step) {
      return errorResponse("not_found", "Step not found.", 404);
    }

    if (mode) {
      const apiKey = Deno.env.get("OPENROUTER_API_KEY")?.trim();
      if (!apiKey) {
        return errorResponse("server_error", "Service temporarily unavailable.", 500);
      }
      const modeSkillTitle =
        (step as { skills?: { title?: string } | { title?: string }[] }).skills instanceof Array
          ? ((step as { skills: { title?: string }[] }).skills[0]?.title ?? "this skill")
          : ((step as { skills?: { title?: string } }).skills?.title ?? "this skill");
      const context =
        `Skill: ${modeSkillTitle}\nStep: ${step.title}\n` +
        `Step summary: ${step.description ?? ""}\n` +
        `Existing explanation: ${step.ai_explanation ?? "(none)"}`;
      const instruction =
        mode === "simplify"
          ? `Re-explain this learning step for a total beginner who found the ` +
            `existing explanation confusing. Use everyday analogies and short ` +
            `sentences. 3-4 sentences, plain text only — no headings, no lists, no markdown.`
          : `Write 3-5 short quiz questions a beginner should be able to answer ` +
            `after finishing this step. Questions only, no answers. One per line, ` +
            `numbered like "1." — plain text only, no markdown.`;

      const gen = await callLLM(apiKey, `${instruction}\n\n${context}`, 700);
      if (!gen.ok) {
        console.error("AI provider error:", gen.detail);
        return errorResponse("provider_error", "Service temporarily unavailable.", 502);
      }
      const result = gen.text;
      if (!result) {
        return errorResponse("provider_error", "Service temporarily unavailable.", 502);
      }
      return jsonResponse({ result, mode });
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
      return errorResponse(
        "not_published",
        "This step's explanation hasn't been published yet.",
        404,
      );
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY")?.trim();
    if (!apiKey) {
      return errorResponse("server_error", "Service temporarily unavailable.", 500);
    }

    const skillTitle =
      (step as { skills?: { title?: string } | { title?: string }[] }).skills instanceof Array
        ? ((step as { skills: { title?: string }[] }).skills[0]?.title ?? "this skill")
        : ((step as { skills?: { title?: string } }).skills?.title ?? "this skill");

    const prompt =
      `You write short explanations for a beginner learning roadmap.\n` +
      `Skill: ${skillTitle}\nStep: ${step.title}\nStep summary: ${step.description ?? ""}\n\n` +
      `Write 3-5 encouraging, plain-language sentences explaining what this step is, ` +
      `why it matters in the journey, and one practical tip for learning it. ` +
      `No headings, no lists, no markdown — one paragraph of plain text only.`;

    const gen = await callLLM(apiKey, prompt, 700);
    if (!gen.ok) {
      console.error("AI provider error:", gen.detail);
      return errorResponse("provider_error", "Service temporarily unavailable.", 502);
    }
    const explanation = gen.text;

    if (!explanation) {
      return errorResponse("provider_error", "Service temporarily unavailable.", 502);
    }

    if (save) {
      const { error: saveError } = await admin
        .from("roadmap_steps")
        .update({ ai_explanation: explanation })
        .eq("id", stepId);
      if (saveError) {
        return errorResponse("server_error", "Generated, but saving failed.", 500);
      }
    }

    return jsonResponse({ explanation, source: "generated", saved: save });
  } catch (err) {
    console.error(err);
    return errorResponse("server_error", "Something went wrong. Please try again.", 500);
  }
});

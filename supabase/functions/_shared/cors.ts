export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Safe error shape for clients: a stable machine-readable code plus a
 * generic human message. Internal details (stack traces, provider errors,
 * DB messages) must be logged server-side only — never passed here.
 */
export function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return jsonResponse({ error: message, code }, status);
}

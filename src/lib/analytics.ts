import { supabase } from "./supabase";

export type FunnelEvent =
  | "signup"
  | "skill_started"
  | "step_completed"
  | "roadmap_viewed"
  | "feedback_submitted";

/**
 * Fire-and-forget funnel logging via the `log_event` SECURITY DEFINER RPC
 * (authenticated only; name whitelist and rate limit enforced in the DB).
 * Analytics must never break UX — failures are logged and swallowed.
 */
export function logEvent(
  name: FunnelEvent,
  metadata: Record<string, unknown> = {},
): void {
  void supabase
    .rpc("log_event", { p_event_name: name, p_metadata: metadata })
    .then(({ error }) => {
      if (error) console.error("logEvent failed:", name, error);
    });
}

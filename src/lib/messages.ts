// Single place that turns internal errors into safe, user-facing copy.
// Rule: raw error objects, Supabase messages, and stack traces never reach
// the UI — they go to the console; the user sees a friendly mapped message.

export const GENERIC_ERROR = "Something went wrong. Please try again.";
export const RATE_LIMITED =
  "You're doing that a little too often. Please try again in a few minutes.";

/**
 * Log the real error and return safe copy for the user.
 * `fallback` lets call sites provide context ("Couldn't save your profile.").
 */
export function friendlyError(error: unknown, fallback = GENERIC_ERROR): string {
  console.error(error);
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  if (message.includes("rate_limited")) return RATE_LIMITED;
  if (message.includes("invalid_input")) {
    return "Please check what you entered and try again.";
  }
  if (/fetch|network|timeout/i.test(message)) return GENERIC_ERROR;
  return fallback;
}

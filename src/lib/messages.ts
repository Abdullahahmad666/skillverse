// Single place that turns internal errors into safe, user-facing copy.
// Rule: raw error objects, Supabase messages, and stack traces never reach
// the UI — they go to the console; the user sees a friendly mapped message.

export const GENERIC_ERROR = "Something went wrong. Please try again.";
export const RATE_LIMITED =
  "You're doing that a little too often. Please try again in a few minutes.";
export const USERNAME_TAKEN = "That username is taken. Try another.";

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return "";
}

export function isUsernameTakenError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /23505/.test(message) ||
    /profiles_username_key|profiles username key/i.test(message) ||
    /duplicate key.*username/i.test(message) ||
    message.includes("username_taken")
  );
}

/**
 * Log the real error and return safe copy for the user.
 * `fallback` lets call sites provide context ("Couldn't save your profile.").
 */
export function friendlyError(error: unknown, fallback = GENERIC_ERROR): string {
  console.error(error);
  const message = errorMessage(error);

  if (isUsernameTakenError(error)) return USERNAME_TAKEN;
  if (message.includes("rate_limited")) return RATE_LIMITED;
  if (message.includes("invalid_input")) {
    return "Please check what you entered and try again.";
  }
  if (/fetch|network|timeout/i.test(message)) return GENERIC_ERROR;
  return fallback;
}

/** Map Supabase Auth signUp errors to user-facing copy. */
export function signupError(error: unknown): string {
  console.error(error);
  const message = errorMessage(error);

  if (isUsernameTakenError(error)) return USERNAME_TAKEN;
  if (/user already registered|already been registered|email.*already/i.test(message)) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AuthRetryableFetchError"
  ) {
    return GENERIC_ERROR;
  }
  if (message.includes("rate_limited")) return RATE_LIMITED;
  return "We couldn't create your account. Please check your details and try again.";
}

// Defense-in-depth input hygiene. React already escapes everything it renders
// (and this app never uses dangerouslySetInnerHTML), so these helpers focus on
// validating and normalizing what we send to the database.

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value: string, maxLength: number): string {
  return value.replace(CONTROL_CHARS, "").trim().slice(0, maxLength);
}

export function validateUsername(value: string): string | null {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(value)) {
    return "Username must be 3–20 characters: letters, numbers, underscores.";
  }
  return null;
}

export function validateDisplayName(value: string): string | null {
  if (value.length === 0) return "Display name can't be empty.";
  if (value.length > 60) return "Display name must be 60 characters or fewer.";
  return null;
}

export function validateAvatarUrl(value: string): string | null {
  if (value === "") return null; // optional
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Avatar must be a valid URL.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Avatar URL must start with http:// or https://";
  }
  if (value.length > 500) return "Avatar URL is too long.";
  return null;
}

export function validateEmail(value: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8) return "Password must be at least 8 characters.";
  return null;
}

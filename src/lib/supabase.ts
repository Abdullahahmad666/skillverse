import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill both in.",
  );
}

// Anon (public) key only — RLS enforces all access rules server-side.
// The service_role key and AI keys live exclusively in Edge Function secrets.
export const supabase = createClient(url, anonKey);

export const DISCORD_URL =
  (import.meta.env.VITE_DISCORD_URL as string | undefined) ?? "";

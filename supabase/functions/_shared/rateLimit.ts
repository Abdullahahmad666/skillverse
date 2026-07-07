import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Sliding-window rate limiter backed by the edge_function_calls table
 * (RLS enabled with no policies — only the service role can read/write it).
 * Enforces BOTH a per-user and a per-IP budget.
 */
export async function checkRateLimit(
  admin: SupabaseClient,
  fn: string,
  userId: string,
  ip: string,
  opts: { userLimit: number; ipLimit: number; windowSeconds: number },
): Promise<{ allowed: boolean; reason?: string }> {
  const since = new Date(Date.now() - opts.windowSeconds * 1000).toISOString();

  const countFor = async (caller: string) => {
    const { count, error } = await admin
      .from("edge_function_calls")
      .select("id", { count: "exact", head: true })
      .eq("fn", fn)
      .eq("caller", caller)
      .gte("called_at", since);
    if (error) throw error;
    return count ?? 0;
  };

  const userKey = `user:${userId}`;
  const ipKey = `ip:${ip}`;

  const [userCount, ipCount] = await Promise.all([
    countFor(userKey),
    countFor(ipKey),
  ]);

  if (userCount >= opts.userLimit) {
    return { allowed: false, reason: "Too many requests. Try again in a minute." };
  }
  if (ipCount >= opts.ipLimit) {
    return { allowed: false, reason: "Too many requests from this network. Try again in a minute." };
  }

  await admin
    .from("edge_function_calls")
    .insert([{ fn, caller: userKey }, { fn, caller: ipKey }]);

  // Opportunistic cleanup of rows older than a day (~1% of calls).
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await admin.from("edge_function_calls").delete().lt("called_at", cutoff);
  }

  return { allowed: true };
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

export function isAdmin(userId: string): boolean {
  const ids = (Deno.env.get("ADMIN_USER_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type {
  Cohort,
  CohortStanding,
  LeaderboardRow,
  UserStats,
} from "../lib/types";

export interface CohortData {
  cohort: Cohort | null;
  /** Sorted by rank: milestones desc, earliest join wins ties. */
  leaderboard: LeaderboardRow[];
  standing: CohortStanding | null;
  stats: UserStats | null;
  /** current_streak, but rendered as 0 once a day has been missed. */
  effectiveStreak: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Days between a YYYY-MM-DD date and today in the browser's local calendar —
 * matching the streak trigger, which stores last_active_date in the user's
 * reported timezone (set via set_user_timezone on sign-in).
 */
function daysSinceLocal(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const then = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((today - then) / 86_400_000);
}

/**
 * Joins (idempotently) the current open cohort for the user's skill via the
 * `join_current_cohort` SECURITY DEFINER RPC — cohort rows are never written
 * from the client — then loads leaderboard, standing, and streak stats.
 * Calling the RPC on every dashboard visit also heals pre-V2 accounts and
 * lazily rotates monthly cohorts without a scheduled job.
 */
export function useCohort(): CohortData {
  const { user, profile } = useAuth();
  const skillId = profile?.current_skill_id ?? null;

  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [standing, setStanding] = useState<CohortStanding | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !skillId) {
      setLoading(false);
      return;
    }
    try {
      const { data: cohortData, error: joinError } = await supabase.rpc(
        "join_current_cohort",
        { p_skill_id: skillId },
      );
      if (joinError) throw joinError;
      const joined = cohortData as Cohort;
      setCohort(joined);

      const [boardRes, standingRes, statsRes] = await Promise.all([
        // SECURITY DEFINER RPC: returns only opted-in members (plus the
        // caller) of cohorts the caller belongs to, already rank-ordered.
        supabase.rpc("get_cohort_leaderboard", { p_cohort_id: joined.id }),
        supabase.rpc("get_cohort_standing", { p_cohort_id: joined.id }),
        supabase.from("user_stats").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      if (boardRes.error) throw boardRes.error;
      if (standingRes.error) throw standingRes.error;
      if (statsRes.error) throw statsRes.error;

      setLeaderboard((boardRes.data ?? []) as LeaderboardRow[]);
      const standingRow = Array.isArray(standingRes.data)
        ? standingRes.data[0]
        : standingRes.data;
      setStanding((standingRow as CohortStanding | undefined) ?? null);
      setStats((statsRes.data as UserStats | null) ?? null);
      setError(null);
    } catch {
      setError("Couldn't load your cohort right now.");
    } finally {
      setLoading(false);
    }
  }, [user, skillId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load().finally(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, [load]);

  const effectiveStreak = useMemo(() => {
    if (!stats?.last_active_date) return 0;
    const gap = daysSinceLocal(stats.last_active_date);
    // Alive if active today/yesterday — or one missed day that an available
    // streak freeze would cover on the next qualifying action.
    if (gap <= 1) return stats.current_streak;
    if (gap === 2 && (stats.streak_freezes_available ?? 0) > 0) {
      return stats.current_streak;
    }
    return 0;
  }, [stats]);

  return {
    cohort,
    leaderboard,
    standing,
    stats,
    effectiveStreak,
    loading,
    error,
    refresh: load,
  };
}

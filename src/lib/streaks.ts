import type { UserStats } from "./types";

// Message style: encouraging, never shaming. Sentence case, no exclamation
// marks, no guilt — a harsh streak system makes people quit.

export const INCREMENT_MESSAGES = [
  "You showed up again. That's how skills get built.",
  "Another day, another step closer.",
  "Momentum is building — keep stacking days.",
  "Consistency beats intensity. Nice work today.",
  "Small daily wins turn into big skills.",
];

export const FIRST_DAY_MESSAGES = [
  "Day one — every streak starts here.",
  "You started. That's the hardest part.",
];

export const STREAK_MILESTONES = [7, 14, 30, 100] as const;

export const MILESTONE_MESSAGES: Record<number, string> = {
  7: "A whole week. You're in the top few percent who make it this far.",
  14: "Two weeks straight — this is officially a habit now.",
  30: "Thirty days. Learners like you are rare; be proud of this one.",
  100: "One hundred days. This isn't a streak anymore, it's who you are.",
};

export const FREEZE_MESSAGES = [
  "You missed a day — we used your streak freeze to keep it alive. It refills next week.",
];

export const RESET_MESSAGES = [
  "Your streak reset — no big deal. Start a new one today; the best learners restart all the time.",
  "Fresh start today. Streaks are a tool, not a judgment — day one begins now.",
];

export function pick<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

export type StreakEvent =
  | { type: "increment"; streak: number }
  | { type: "streak_milestone"; streak: number }
  | { type: "freeze_used"; streak: number }
  | { type: "reset" };

/**
 * Derive what just happened to the streak by comparing the stats row before
 * and after a qualifying action. The server-side trigger is the source of
 * truth; the client only decides which celebration to show.
 */
export function diffStreak(
  before: UserStats | null,
  after: UserStats,
): StreakEvent | null {
  const prevStreak = before?.current_streak ?? 0;
  const next = after.current_streak;

  if (before && next === 1 && prevStreak > 1) return { type: "reset" };
  if (next <= prevStreak) return null; // same day — already celebrated

  const freezeUsed =
    before != null &&
    (after.streak_freezes_available ?? 0) < (before.streak_freezes_available ?? 0);
  if (freezeUsed) return { type: "freeze_used", streak: next };

  if (STREAK_MILESTONES.includes(next as (typeof STREAK_MILESTONES)[number])) {
    return { type: "streak_milestone", streak: next };
  }
  return { type: "increment", streak: next };
}

export function messageFor(event: StreakEvent): string {
  switch (event.type) {
    case "streak_milestone":
      return MILESTONE_MESSAGES[event.streak] ?? pick(INCREMENT_MESSAGES);
    case "freeze_used":
      return pick(FREEZE_MESSAGES);
    case "reset":
      return pick(RESET_MESSAGES);
    case "increment":
      return event.streak === 1
        ? pick(FIRST_DAY_MESSAGES)
        : event.streak <= 5
          ? `${event.streak} days strong — momentum is building.`
          : pick(INCREMENT_MESSAGES);
  }
}

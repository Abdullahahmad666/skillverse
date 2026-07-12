import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { diffStreak, messageFor } from "../lib/streaks";
import type { UserStats } from "../lib/types";

interface StreakContextValue {
  /**
   * Call after a qualifying action (step done, milestone completed).
   * Fetches the trigger-maintained stats, diffs against the previous
   * snapshot, and shows the right celebration/toast. Never throws.
   */
  checkAfterAction: () => Promise<void>;
}

interface Celebration {
  streak: number;
  big: boolean;
  message: string;
}

const StreakContext = createContext<StreakContextValue | undefined>(undefined);

async function fetchStats(userId: string): Promise<UserStats | null> {
  const { data, error } = await supabase
    .from("user_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(error);
    return null;
  }
  return (data as UserStats | null) ?? null;
}

export function StreakProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const prevStats = useRef<UserStats | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const hideTimer = useRef<number>(0);

  // Baseline snapshot so the first action of a session diffs correctly.
  useEffect(() => {
    prevStats.current = null;
    if (!user) return;
    void fetchStats(user.id).then((s) => {
      prevStats.current = s;
    });
  }, [user]);

  const show = useCallback((c: Celebration) => {
    window.clearTimeout(hideTimer.current);
    setCelebration(c);
    hideTimer.current = window.setTimeout(
      () => setCelebration(null),
      c.big ? 3200 : 2600,
    );
  }, []);

  const checkAfterAction = useCallback(async () => {
    if (!user) return;
    const after = await fetchStats(user.id);
    if (!after) return;
    const before = prevStats.current;
    prevStats.current = after;

    const event = diffStreak(before, after);
    if (!event) return;
    const message = messageFor(event);

    switch (event.type) {
      case "increment":
        show({ streak: event.streak, big: false, message });
        break;
      case "streak_milestone":
        show({ streak: event.streak, big: true, message });
        break;
      case "freeze_used":
      case "reset":
        // Gentle, non-blocking heads-up — never a shaming overlay.
        toast(message);
        break;
    }
  }, [user, show, toast]);

  return (
    <StreakContext.Provider value={{ checkAfterAction }}>
      {children}
      {celebration && (
        <div
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center px-4"
          role="status"
          aria-live="polite"
        >
          <div
            className={`streak-pop relative flex flex-col items-center gap-1.5 rounded-3xl bg-abyss px-8 py-6 text-center text-glow shadow-lift ${
              celebration.big ? "ring-2 ring-marigold" : ""
            }`}
          >
            {celebration.big && <SparkRing />}
            <span aria-hidden className="flame-flicker text-marigold">
              <BigFlame />
            </span>
            <div className="font-display text-3xl font-extrabold leading-none">
              {celebration.streak}
              <span className="ml-1.5 text-base font-bold text-glow/70">
                day{celebration.streak === 1 ? "" : "s"}
              </span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-glow/80">
              {celebration.message}
            </p>
          </div>
        </div>
      )}
    </StreakContext.Provider>
  );
}

export function useStreak(): StreakContextValue {
  const ctx = useContext(StreakContext);
  if (!ctx) throw new Error("useStreak must be used inside <StreakProvider>");
  return ctx;
}

/** Eight sparks flying outward — pure CSS, used for big streak milestones. */
function SparkRing() {
  return (
    <span aria-hidden className="absolute inset-0 overflow-visible">
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={i}
          className="spark absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-marigold"
          style={{ "--spark-angle": `${i * 45}deg` } as CSSProperties}
        />
      ))}
    </span>
  );
}

function BigFlame() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2s1 2.4 1 4.2c0 1.7-1.1 2.9-2.6 2.9C8.8 9.1 8 8 8 6.5v-.6S5 8.6 5 12.6C5 16.7 8.1 22 12 22s7-4.1 7-8.4C19 7.5 12 2 12 2Zm0 18c-1.7 0-3-1.6-3-3.5 0-1.7 1.1-2.9 2-4 .7.9 4 2.4 4 5 0 1.4-1.3 2.5-3 2.5Z" />
    </svg>
  );
}

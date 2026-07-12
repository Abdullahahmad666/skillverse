import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { LoadingScreen } from "../components/LoadingScreen";
import { ProgressRing } from "../components/ProgressRing";
import { Reveal } from "../components/Reveal";
import { Leaderboard } from "../components/Leaderboard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useRoadmap } from "../hooks/useRoadmap";
import { useCohort } from "../hooks/useCohort";
import { useInView, useCountUp } from "../hooks/useInView";
import { supabase, DISCORD_URL } from "../lib/supabase";

const LEADERBOARD_PROMPT_KEY = "sv-leaderboard-prompt-dismissed";

export function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth();
  const {
    skill,
    steps,
    resourcesByStep,
    milestones,
    progressByStep,
    achievedMilestones,
    loading,
    error,
    doneCount,
    totalCount,
    progressPercent,
    nextStep,
    nextMilestone,
  } = useRoadmap();
  const cohortData = useCohort();

  if (loading) return <AppShell><LoadingScreen /></AppShell>;

  const name = profile?.display_name || profile?.username || "there";
  const finished = totalCount > 0 && doneCount === totalCount;

  return (
    <AppShell>
      {/* 1 — Current skill + streak */}
      <div className="reveal flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow">{skill?.title ?? "Your skill"}</p>
            {cohortData.cohort && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-card px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-fog">
                <PeopleIcon />
                {cohortData.cohort.label}
              </span>
            )}
          </div>
          <h1 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {finished ? `You did it, ${name}.` : `Hey ${name}, keep going.`}
          </h1>
        </div>
        <StreakBadge
          streak={cohortData.effectiveStreak}
          longest={cohortData.stats?.longest_streak ?? 0}
          freezes={cohortData.stats?.streak_freezes_available ?? 0}
        />
      </div>

      {(error || cohortData.error) && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error ?? cohortData.error}
        </p>
      )}

      {/* 2 — Progress hero: ring + step / milestone / time stats */}
      <Reveal ariaLabel="Overall progress" delay={60} className="mt-6">
        <div className="overflow-hidden rounded-3xl border border-mist bg-card shadow-card">
          <div className="grid gap-2 p-6 sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-7">
            <div className="flex items-center justify-center">
              <ProgressRing percent={progressPercent} />
            </div>
            <div className="flex flex-col justify-center gap-4">
              <HeroStat
                icon={<StepsIcon />}
                value={finished ? "All steps complete" : `Step ${Math.min(doneCount + 1, totalCount)} of ${totalCount}`}
                caption={`${doneCount} done · ${totalCount - doneCount} to go`}
              />
              <HeroStat
                icon={<FlagIcon className="text-marigold" />}
                value={
                  nextMilestone
                    ? `${stepsToMilestone(steps, progressByStep, nextMilestone.after_step_id)} steps to “${nextMilestone.title}”`
                    : "Every milestone passed"
                }
                caption={`${Object.keys(achievedMilestones).length} of ${milestones.length} milestones passed`}
              />
              <HeroStat
                icon={<ClockIcon />}
                value={hoursRemainingLabel(steps, progressByStep)}
                caption="estimated time remaining"
              />
            </div>
          </div>
          <MilestoneTrack
            steps={steps}
            milestones={milestones}
            achievedIds={achievedMilestones}
            percent={progressPercent}
          />
        </div>
      </Reveal>

      {/* 3 — Cohort standing */}
      <Reveal ariaLabel="Cohort standing" delay={100} className="mt-4">
        <StandingCard
          loading={cohortData.loading}
          label={cohortData.cohort?.label ?? null}
          totalMembers={cohortData.standing?.total_members ?? 0}
          membersBehind={cohortData.standing?.members_behind ?? 0}
        />
      </Reveal>

      {/* 4 — Next up */}
      <Reveal ariaLabel="Next step" delay={140} className="mt-4">
        <div className="group rounded-3xl border border-mist bg-card p-6 shadow-card transition-shadow hover:shadow-lift">
          <div className="eyebrow mb-2">{finished ? "Roadmap complete" : "Next up"}</div>
          {nextStep ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-bold leading-snug">
                  <span className="mr-2.5 font-mono text-sm font-medium text-jade-deep">
                    {String(nextStep.order_index).padStart(2, "0")}
                  </span>
                  {nextStep.title}
                </h2>
                {nextStep.description && (
                  <p className="mt-1 text-sm leading-relaxed text-fog">{nextStep.description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip icon={<BookIcon />}>
                    {(resourcesByStep[nextStep.id] ?? []).length} free resources
                  </Chip>
                  {nextStep.estimated_hours != null && (
                    <Chip icon={<ClockIcon small />}>~{nextStep.estimated_hours}h</Chip>
                  )}
                </div>
              </div>
              <Link
                to={`/roadmap#step-${nextStep.id}`}
                className="btn-primary flex-none self-start sm:self-center"
              >
                Continue
                <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-relaxed text-fog">
                Every step is done. Revisit anything on the roadmap, or share what
                you built with your cohort.
              </p>
              <Link to="/roadmap" className="btn-ghost flex-none self-start">
                View roadmap
              </Link>
            </div>
          )}
        </div>
      </Reveal>

      {/* 5 — Cohort leaderboard */}
      <Reveal ariaLabel="Cohort leaderboard" delay={180} className="mt-4">
        <div className="rounded-3xl border border-mist bg-card p-6 shadow-card">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-bold">Cohort leaderboard</h2>
            <span className="font-mono text-[11px] text-fog">
              ranked by milestones passed
            </span>
          </div>

          {user && profile && !profile.show_on_leaderboard && (
            <LeaderboardOptInPrompt
              onJoined={async () => {
                await refreshProfile();
                await cohortData.refresh();
              }}
              userId={user.id}
            />
          )}

          {cohortData.loading ? (
            <LeaderboardSkeleton />
          ) : user ? (
            <Leaderboard
              rows={cohortData.leaderboard}
              currentUserId={user.id}
              optedIn={profile?.show_on_leaderboard ?? false}
              milestonesTotal={milestones.length}
            />
          ) : null}

          {!cohortData.loading && cohortData.leaderboard.length === 1 && (
            <p className="mt-3 text-center text-xs text-fog">
              You're first into this cohort — new learners join all month.
            </p>
          )}
        </div>
      </Reveal>

      {/* Community */}
      <Reveal ariaLabel="Community" delay={220} className="mt-4">
        <div className="relative overflow-hidden rounded-3xl bg-pine p-6 text-paper sm:p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-jade/25 blur-3xl"
          />
          <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-lg font-bold">Learning is easier together</h2>
              <p className="mt-1 text-sm text-paper/70">
                Ask questions, share progress, and find study partners from your cohort.
              </p>
            </div>
            {DISCORD_URL ? (
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-none items-center gap-2 rounded-xl bg-marigold px-5 py-3 font-medium text-pine transition-all hover:brightness-105 active:scale-[0.98]"
              >
                Join the learners' Discord
              </a>
            ) : (
              <span className="font-mono text-xs text-paper/60">Discord link coming soon</span>
            )}
          </div>
        </div>
      </Reveal>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Derived numbers                                                     */
/* ------------------------------------------------------------------ */

type ProgressMap = ReturnType<typeof useRoadmap>["progressByStep"];
type Steps = ReturnType<typeof useRoadmap>["steps"];
type Milestones = ReturnType<typeof useRoadmap>["milestones"];

function stepsToMilestone(steps: Steps, progress: ProgressMap, anchorStepId: string) {
  const anchor = steps.find((s) => s.id === anchorStepId);
  if (!anchor) return 0;
  return steps.filter(
    (s) => s.order_index <= anchor.order_index && progress[s.id]?.status !== "done",
  ).length;
}

function hoursRemainingLabel(steps: Steps, progress: ProgressMap) {
  const hours = steps
    .filter((s) => progress[s.id]?.status !== "done")
    .reduce((sum, s) => sum + (s.estimated_hours ?? 0), 0);
  if (hours <= 0) return "0h left";
  return `~${Math.ceil(hours)}h left`;
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function StreakBadge({
  streak,
  longest,
  freezes,
}: {
  streak: number;
  longest: number;
  freezes: number;
}) {
  const active = streak > 0;
  return (
    <div className="reveal flex flex-none items-center gap-3 self-start rounded-2xl border border-mist bg-card px-4 py-3 shadow-card sm:self-auto">
      <span
        aria-hidden
        className={active ? "flame-flicker text-marigold" : "text-mist"}
      >
        <FlameIcon />
      </span>
      <div>
        <div className="font-display text-xl font-extrabold leading-none">
          {streak}
          <span className="ml-1 text-sm font-bold text-fog">
            day{streak === 1 ? "" : "s"}
          </span>
        </div>
        <div className="eyebrow mt-1">
          {active ? "streak" : "start today"}
        </div>
      </div>
      {longest > 1 && (
        <div className="ml-1 border-l border-mist pl-3">
          <div className="font-mono text-sm font-semibold text-fog">{longest}</div>
          <div className="eyebrow mt-0.5">best</div>
        </div>
      )}
      {freezes > 0 && (
        <div
          className="ml-1 border-l border-mist pl-3"
          title="Streak freeze: covers one missed day automatically"
        >
          <div className="flex items-center gap-1 font-mono text-sm font-semibold text-sky-600">
            <SnowflakeIcon />
            {freezes}
          </div>
          <div className="eyebrow mt-0.5">freeze</div>
        </div>
      )}
    </div>
  );
}

function SnowflakeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 2v20M4 6l16 12M20 6 4 18M12 2l-2.5 2.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5" strokeLinecap="round" />
    </svg>
  );
}

function HeroStat({
  icon,
  value,
  caption,
}: {
  icon: ReactNode;
  value: string;
  caption: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-paper text-jade-deep">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="font-display text-[15px] font-bold leading-snug sm:text-base">{value}</div>
        <div className="mt-0.5 font-mono text-[11px] text-fog">{caption}</div>
      </div>
    </div>
  );
}

/** Slim journey bar with milestone flags at their anchor positions. */
function MilestoneTrack({
  steps,
  milestones,
  achievedIds,
  percent,
}: {
  steps: Steps;
  milestones: Milestones;
  achievedIds: Record<string, unknown>;
  percent: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const total = steps.length;
  if (total === 0 || milestones.length === 0) return null;

  const orderById: Record<string, number> = {};
  for (const s of steps) orderById[s.id] = s.order_index;

  return (
    <div ref={ref} className="border-t border-mist/70 bg-paper/60 px-6 pb-5 pt-6 sm:px-7">
      <div className="relative" aria-hidden>
        <div className="h-1.5 overflow-hidden rounded-full bg-mist">
          <div
            className="h-full rounded-full bg-gradient-to-r from-jade to-[#2FC08D] transition-[width] duration-[1200ms] ease-out"
            style={{ width: `${inView ? percent : 0}%` }}
          />
        </div>
        {milestones.map((m) => {
          const pos = ((orderById[m.after_step_id] ?? 0) / total) * 100;
          const achieved = Boolean(achievedIds[m.id]);
          return (
            <span
              key={m.id}
              title={m.title}
              className={`absolute -top-[9px] flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 transition-colors duration-500 ${
                achieved
                  ? "border-marigold bg-marigold text-white"
                  : "border-mist bg-card text-fog"
              }`}
              style={{ left: `${Math.min(pos, 99)}%` }}
            >
              <FlagIcon className="" small />
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-wide text-fog">
        <span>Start</span>
        <span>Milestones</span>
        <span>Finish</span>
      </div>
    </div>
  );
}

function StandingCard({
  loading,
  label,
  totalMembers,
  membersBehind,
}: {
  loading: boolean;
  label: string | null;
  totalMembers: number;
  membersBehind: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const others = Math.max(totalMembers - 1, 0);
  const pct = others > 0 ? Math.round((membersBehind / others) * 100) : 0;
  const shown = useCountUp(pct, inView);

  return (
    <div ref={ref} className="rounded-3xl border border-mist bg-card p-6 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">Cohort standing</h2>
        {label && (
          <span className="truncate font-mono text-[11px] text-fog">{label}</span>
        )}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="h-7 w-2/3 animate-pulse rounded-lg bg-mist/70" />
          <div className="h-2.5 w-full animate-pulse rounded-full bg-mist/70" />
        </div>
      ) : others === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-fog">
          You're the trailblazer — cohort comparisons unlock as more learners
          join this month.
        </p>
      ) : (
        <>
          <p className="mt-2 font-display text-2xl font-extrabold tracking-tight">
            Ahead of {shown}%{" "}
            <span className="text-base font-bold text-fog">of your cohort</span>
          </p>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-mist"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Ahead of ${pct}% of your cohort`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-jade to-[#2FC08D] transition-[width] duration-[1200ms] ease-out"
              style={{ width: `${inView ? Math.max(pct, 2) : 0}%` }}
            />
          </div>
          <p className="mt-2.5 font-mono text-[11px] text-fog">
            {totalMembers} member{totalMembers === 1 ? "" : "s"} · measured by
            milestones passed, not checkboxes
          </p>
        </>
      )}
    </div>
  );
}

function LeaderboardOptInPrompt({
  userId,
  onJoined,
}: {
  userId: string;
  onJoined: () => Promise<void>;
}) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(LEADERBOARD_PROMPT_KEY) === "1",
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { toast } = useToast();

  if (dismissed) return null;

  const join = async () => {
    setBusy(true);
    setFailed(false);
    const { error } = await supabase
      .from("profiles")
      .update({ show_on_leaderboard: true })
      .eq("id", userId);
    if (error) {
      console.error(error);
      setBusy(false);
      setFailed(true);
      return;
    }
    await onJoined();
    setBusy(false);
    toast("You're on the leaderboard");
  };

  const dismiss = () => {
    localStorage.setItem(LEADERBOARD_PROMPT_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="mb-4 rounded-2xl border border-jade/25 bg-jade-tint/70 p-4">
      <p className="text-sm font-medium text-jade-deep">
        You're currently hidden from cohort-mates.
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-pinesoft">
        Joining shows only your display name, avatar, and milestone count —
        never your detailed progress. Change it anytime in your profile.
      </p>
      {failed && (
        <p role="alert" className="mt-2 text-xs text-danger">
          Couldn't update your setting. Try again.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => void join()} disabled={busy} className="btn-primary !px-4 !py-2 text-sm">
          {busy ? "Joining…" : "Show me on the leaderboard"}
        </button>
        <button onClick={dismiss} className="btn-ghost !px-4 !py-2 text-sm">
          Keep me hidden
        </button>
      </div>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <div className="h-7 w-7 animate-pulse rounded-full bg-mist/70" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-mist/70" />
          <div className="h-4 flex-1 animate-pulse rounded bg-mist/60" />
          <div className="h-4 w-10 animate-pulse rounded bg-mist/60" />
        </div>
      ))}
    </div>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-paper px-2.5 py-1 font-mono text-[11px] font-medium text-fog">
      <span aria-hidden>{icon}</span>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

function FlameIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2s1 2.4 1 4.2c0 1.7-1.1 2.9-2.6 2.9C8.8 9.1 8 8 8 6.5v-.6S5 8.6 5 12.6C5 16.7 8.1 22 12 22s7-4.1 7-8.4C19 7.5 12 2 12 2Zm0 18c-1.7 0-3-1.6-3-3.5 0-1.7 1.1-2.9 2-4 .7.9 4 2.4 4 5 0 1.4-1.3 2.5-3 2.5Z" />
    </svg>
  );
}

function FlagIcon({ className = "", small = false }: { className?: string; small?: boolean }) {
  const s = small ? 10 : 15;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M5 21V4a1 1 0 0 1 1-1h11.3a1 1 0 0 1 .8 1.6L15.8 8l2.3 3.4a1 1 0 0 1-.8 1.6H7v8H5Z" />
    </svg>
  );
}

function StepsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 20h4v-4h4v-4h4V8h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon({ small = false }: { small?: boolean }) {
  const s = small ? 12 : 16;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 4.5a3 3 0 0 1 0 7M21 20a6 6 0 0 0-4.5-5.8" strokeLinecap="round" />
    </svg>
  );
}

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
    stages,
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

  // Command-center metrics (all from data already loaded — no extra queries).
  const hoursInvested = Math.round(
    steps.filter((s) => progressByStep[s.id]?.status === "done").reduce((n, s) => n + (s.estimated_hours ?? 0), 0),
  );
  const hoursLeft = Math.ceil(
    steps.filter((s) => progressByStep[s.id]?.status !== "done").reduce((n, s) => n + (s.estimated_hours ?? 0), 0),
  );
  const achievedCount = Object.keys(achievedMilestones).length;
  const cohortOthers = Math.max((cohortData.standing?.total_members ?? 0) - 1, 0);
  const percentile =
    cohortOthers > 0 ? Math.round(((cohortData.standing?.members_behind ?? 0) / cohortOthers) * 100) : 0;

  return (
    <AppShell wide>
      {/* 1 — Current skill + streak */}
      <div className="reveal flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow">{skill?.title ?? "Your skill"}</p>
            {cohortData.cohort && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-mist bg-card px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-fog">
                <span className="flex-none"><PeopleIcon /></span>
                <span className="truncate">{cohortData.cohort.label}</span>
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

      {/* KPI command-center row */}
      <StatTiles
        tiles={[
          { label: "steps done", value: doneCount, suffix: `/${totalCount}`, sub: "completed", icon: <StepsIcon />, accent: "jade" },
          { label: "hours invested", value: hoursInvested, suffix: "h", sub: "of focused learning", icon: <ClockIcon />, accent: "marigold" },
          { label: "milestones", value: achievedCount, suffix: `/${milestones.length}`, sub: "projects passed", icon: <FlagIcon />, accent: "violet" },
          { label: "ahead of cohort", value: percentile, suffix: "%", sub: cohortOthers > 0 ? "of your cohort" : "be the first", icon: <PeopleIcon />, accent: "sky" },
          { label: "time to finish", value: hoursLeft, suffix: "h", sub: finished ? "you're done!" : "estimated left", icon: <TargetIcon />, accent: "emerald" },
        ]}
      />

      {/* 2 — Progress hero: ring + step / milestone / time stats */}
      <Reveal ariaLabel="Overall progress" delay={60} className="mt-4">
        <div className="overflow-hidden rounded-3xl border border-mist bg-card shadow-card">
          <div className="grid gap-2 p-6 sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-7">
            <div className="flex items-center justify-center">
              <ProgressRing percent={progressPercent} />
            </div>
            {/* Unique to the hero — the numbers live in the KPI row above, so
                here we focus on the story: how far along, and what's next. */}
            <div className="flex flex-col justify-center gap-3">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {finished
                    ? "Roadmap complete 🎉"
                    : `You're ${progressPercent}% through ${skill?.title ?? "your roadmap"}`}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-fog">
                  {finished
                    ? "Every step and milestone is done. Revisit anything, or start a new skill."
                    : "Steady progress beats intensity — here's the milestone you're working toward."}
                </p>
              </div>
              {!finished && nextMilestone && (
                <div className="flex items-center gap-3 rounded-xl border border-marigold/30 bg-marigold-tint/50 px-3.5 py-3">
                  <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-marigold text-white">
                    <FlagIcon />
                  </span>
                  <div className="min-w-0">
                    <div className="eyebrow !text-marigold-ink">Next milestone</div>
                    <div className="truncate font-display text-sm font-bold">{nextMilestone.title}</div>
                    <div className="font-mono text-[11px] text-fog">
                      {stepsToMilestone(steps, progressByStep, nextMilestone.after_step_id)} steps away
                    </div>
                  </div>
                </div>
              )}
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

      {/* Bento: full-width primary action, then a balanced 3-card insight
          row, then full-width cohort sections. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3 lg:items-stretch">
      {/* Next up — primary action, full width */}
      <Reveal ariaLabel="Next step" delay={100} className="lg:col-span-3">
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

      {/* Insight row — progress by stage, recent activity, cohort standing */}
      <Reveal ariaLabel="Stage progress" delay={140} className="lg:col-span-1">
        <StageProgress stages={stages} steps={steps} progressByStep={progressByStep} />
      </Reveal>
      <Reveal ariaLabel="Recently completed" delay={170} className="lg:col-span-1">
        <RecentlyCompleted steps={steps} progressByStep={progressByStep} />
      </Reveal>
      <Reveal ariaLabel="Cohort standing" delay={200} className="lg:col-span-1">
        <StandingCard
          loading={cohortData.loading}
          totalMembers={cohortData.standing?.total_members ?? 0}
          membersBehind={cohortData.standing?.members_behind ?? 0}
        />
      </Reveal>

      {/* Cohort leaderboard */}
      <Reveal ariaLabel="Cohort leaderboard" delay={180} className="lg:col-span-3">
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

      {/* Community — full-width banner (its natural wide layout) */}
      <Reveal ariaLabel="Community" delay={220} className="lg:col-span-3">
        <div className="relative overflow-hidden rounded-3xl bg-abyss p-6 text-glow sm:p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-jade/25 blur-3xl"
          />
          <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-lg font-bold">Learning is easier together</h2>
              <p className="mt-1 text-sm text-glow/70">
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
              <span className="font-mono text-xs text-glow/60">Discord link coming soon</span>
            )}
          </div>
        </div>
      </Reveal>
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Derived numbers                                                     */
/* ------------------------------------------------------------------ */

type ProgressMap = ReturnType<typeof useRoadmap>["progressByStep"];
type Steps = ReturnType<typeof useRoadmap>["steps"];
type Milestones = ReturnType<typeof useRoadmap>["milestones"];
type StagesList = ReturnType<typeof useRoadmap>["stages"];

function relativeDay(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function stepsToMilestone(steps: Steps, progress: ProgressMap, anchorStepId: string) {
  const anchor = steps.find((s) => s.id === anchorStepId);
  if (!anchor) return 0;
  return steps.filter(
    (s) => s.order_index <= anchor.order_index && progress[s.id]?.status !== "done",
  ).length;
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
          <div className="flex items-center gap-1 font-mono text-sm font-semibold text-sky-600 dark:text-sky-400">
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
  totalMembers,
  membersBehind,
}: {
  loading: boolean;
  totalMembers: number;
  membersBehind: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const others = Math.max(totalMembers - 1, 0);
  const pct = others > 0 ? Math.round((membersBehind / others) * 100) : 0;
  const shown = useCountUp(pct, inView);

  return (
    <div ref={ref} className="flex h-full flex-col rounded-3xl border border-mist bg-card p-6 shadow-card">
      <h2 className="eyebrow">Cohort standing</h2>

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="h-7 w-2/3 animate-pulse rounded-lg bg-mist/70" />
          <div className="h-2.5 w-full animate-pulse rounded-full bg-mist/70" />
        </div>
      ) : others === 0 ? (
        <p className="mt-3 flex-1 text-sm leading-relaxed text-fog">
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
          <p className="mt-auto pt-4 font-mono text-[11px] text-fog">
            {totalMembers} member{totalMembers === 1 ? "" : "s"} · by milestones passed
          </p>
        </>
      )}
    </div>
  );
}

/** Per-stage (or per-level fallback) completion bars. */
function StageProgress({
  stages,
  steps,
  progressByStep,
}: {
  stages: StagesList;
  steps: Steps;
  progressByStep: ProgressMap;
}) {
  const useStages = stages.length > 0;
  const groups = useStages
    ? stages.map((st) => ({ key: st.id, title: st.title, list: steps.filter((s) => s.stage_id === st.id) }))
    : (["beginner", "intermediate", "advanced"] as const).map((lvl) => ({
        key: lvl,
        title: lvl[0].toUpperCase() + lvl.slice(1),
        list: steps.filter((s) => (s.level ?? "beginner") === lvl),
      }));

  const rows = groups
    .filter((g) => g.list.length > 0)
    .map((g) => {
      const done = g.list.filter((s) => progressByStep[s.id]?.status === "done").length;
      return { key: g.key, title: g.title, done, total: g.list.length, pct: Math.round((done / g.list.length) * 100) };
    });

  return (
    <div className="flex h-full flex-col rounded-3xl border border-mist bg-card p-6 shadow-card">
      <h2 className="font-display text-lg font-bold">{useStages ? "Stage progress" : "Progress by level"}</h2>
      <div className="mt-4 flex-1 space-y-3.5">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{r.title}</span>
              <span className="flex-none font-mono text-[11px] text-fog">{r.done}/{r.total}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-mist">
              <div
                className={`h-full rounded-full ${r.pct === 100 ? "bg-marigold" : "bg-gradient-to-r from-jade to-[#2FC08D]"}`}
                style={{ width: `${r.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The learner's most recent completed steps — a momentum log. */
function RecentlyCompleted({ steps, progressByStep }: { steps: Steps; progressByStep: ProgressMap }) {
  const done = steps
    .filter((s) => progressByStep[s.id]?.status === "done")
    .map((s) => ({ step: s, at: progressByStep[s.id]?.completed_at ?? null }))
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 4);

  return (
    <div className="flex h-full flex-col rounded-3xl border border-mist bg-card p-6 shadow-card">
      <h2 className="font-display text-lg font-bold">Recently completed</h2>
      {done.length === 0 ? (
        <p className="mt-4 flex-1 text-sm leading-relaxed text-fog">
          Finish your first step and it'll appear here — your momentum log.
        </p>
      ) : (
        <ul className="mt-4 flex-1 space-y-3">
          {done.map(({ step, at }) => (
            <li key={step.id} className="flex items-center gap-3">
              <span aria-hidden className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-jade-tint text-jade-deep">
                <CheckIcon />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{step.title}</div>
                {at && <div className="font-mono text-[10px] text-fog">{relativeDay(at)}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <path d="M5 12.5 10 17l9-10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
/* KPI command-center tiles                                            */
/* ------------------------------------------------------------------ */

type Accent = "jade" | "marigold" | "violet" | "sky" | "emerald";

const TILE_ACCENT: Record<Accent, string> = {
  jade: "from-jade to-jade-deep",
  marigold: "from-marigold to-[#c77f00]",
  violet: "from-[#a897ff] to-[#7c5cff]",
  sky: "from-sky-400 to-sky-600",
  emerald: "from-emerald-400 to-emerald-600",
};

interface TileDef {
  label: string;
  value: number;
  suffix?: string;
  sub: string;
  icon: ReactNode;
  accent: Accent;
}

function StatTiles({ tiles }: { tiles: TileDef[] }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      aria-label="Your stats"
      className="reveal mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {tiles.map((t) => (
        <StatTile key={t.label} {...t} inView={inView} />
      ))}
    </div>
  );
}

function StatTile({ label, value, suffix, sub, icon, accent, inView }: TileDef & { inView: boolean }) {
  const shown = useCountUp(value, inView);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-mist bg-card p-4 shadow-card transition-shadow hover:shadow-lift">
      {/* faint accent wash for depth */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-gradient-to-br ${TILE_ACCENT[accent]} opacity-[0.07] blur-xl`}
      />
      <span
        aria-hidden
        className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${TILE_ACCENT[accent]} text-white shadow-sm`}
      >
        {icon}
      </span>
      <div className="mt-3 font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">
        {shown}
        {suffix && <span className="text-fog">{suffix}</span>}
      </div>
      <div className="eyebrow mt-0.5">{label}</div>
      <div className="mt-0.5 font-mono text-[10px] text-fog/80">{sub}</div>
    </div>
  );
}

function TargetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
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

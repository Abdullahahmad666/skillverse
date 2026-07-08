import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { LoadingScreen } from "../components/LoadingScreen";
import { MilestoneMarker, StepCard } from "../components/StepCard";
import { useRoadmap } from "../hooks/useRoadmap";
import { logEvent } from "../lib/analytics";
import type { Milestone, RoadmapStep, StepLevel } from "../lib/types";

type TrailItem =
  | { kind: "step"; step: RoadmapStep; stepIndex: number }
  | { kind: "milestone"; milestone: Milestone; anchorStepId: string }
  | { kind: "level"; level: StepLevel; stepCount: number; hours: number };

const LEVEL_STYLES: Record<StepLevel, { label: string; chip: string; dot: string }> = {
  beginner: {
    label: "Beginner",
    chip: "bg-jade-tint text-jade-deep",
    dot: "bg-jade",
  },
  intermediate: {
    label: "Intermediate",
    chip: "bg-marigold-tint text-marigold-ink",
    dot: "bg-marigold",
  },
  advanced: {
    label: "Advanced",
    chip: "bg-pine text-paper",
    dot: "bg-paper",
  },
};

const levelOf = (s: RoadmapStep): StepLevel => s.level ?? "beginner";

export function RoadmapPage() {
  const {
    skill,
    steps,
    milestones,
    resourcesByStep,
    progressByStep,
    achievedMilestones,
    loading,
    error,
    setStepStatus,
    doneCount,
    totalCount,
    progressPercent,
    nextStep,
  } = useRoadmap();
  const location = useLocation();

  // Step targeted by a dashboard deep link (/roadmap#step-<id>).
  const targetStepId = location.hash.startsWith("#step-")
    ? location.hash.slice("#step-".length)
    : null;

  // Interleave milestones into the step list at their anchored positions,
  // with a level divider wherever the difficulty tier changes.
  const trail = useMemo<TrailItem[]>(() => {
    const items: TrailItem[] = [];
    steps.forEach((step, i) => {
      const level = levelOf(step);
      if (i === 0 || levelOf(steps[i - 1]) !== level) {
        const group = steps.filter((s) => levelOf(s) === level);
        items.push({
          kind: "level",
          level,
          stepCount: group.length,
          hours: Math.ceil(
            group.reduce((sum, s) => sum + (s.estimated_hours ?? 0), 0),
          ),
        });
      }
      items.push({ kind: "step", step, stepIndex: i });
      milestones
        .filter((m) => m.after_step_id === step.id)
        .forEach((m) =>
          items.push({ kind: "milestone", milestone: m, anchorStepId: step.id }),
        );
    });
    return items;
  }, [steps, milestones]);

  // Funnel: one roadmap_viewed event per visit.
  useEffect(() => {
    logEvent("roadmap_viewed");
  }, []);

  // Smooth-scroll to a step when arriving via /roadmap#step-<id>.
  useEffect(() => {
    if (loading || !location.hash) return;
    const el = document.querySelector(location.hash);
    if (el) {
      const t = window.setTimeout(
        () => el.scrollIntoView({ behavior: "smooth", block: "start" }),
        150,
      );
      return () => window.clearTimeout(t);
    }
  }, [loading, location.hash]);

  if (loading) return <AppShell><LoadingScreen label="Loading your roadmap" /></AppShell>;

  const isDone = (stepId: string) => progressByStep[stepId]?.status === "done";

  return (
    <AppShell>
      <header className="reveal">
        <p className="eyebrow">Roadmap</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          {skill?.title ?? "Your roadmap"}
        </h1>
        {skill?.description && (
          <p className="mt-2 max-w-xl leading-relaxed text-fog">{skill.description}</p>
        )}

        {/* Slim progress bar */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="font-mono text-xs font-medium text-jade-deep">
              {doneCount} of {totalCount} steps done
            </span>
            <span className="font-mono text-xs text-fog">{progressPercent}%</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-mist"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Roadmap progress"
          >
            <div
              className="h-full rounded-full bg-jade transition-[width] duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ol className="mt-8 list-none" aria-label="Roadmap steps">
        {trail.map((item, i) => {
          const delay = Math.min(i * 40, 400);
          if (item.kind === "level") {
            const s = LEVEL_STYLES[item.level];
            return (
              <li
                key={`level-${item.level}`}
                className="reveal mb-5 flex items-center gap-3 pt-2"
                style={{ animationDelay: `${delay}ms` }}
              >
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${s.chip}`}
                >
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
                <span className="font-mono text-[11px] text-fog">
                  {item.stepCount} steps · ~{item.hours}h
                </span>
                <span aria-hidden className="h-px flex-1 bg-mist" />
              </li>
            );
          }
          if (item.kind === "step") {
            const status = progressByStep[item.step.id]?.status ?? "not_started";
            const prevStep = steps[item.stepIndex - 1];
            return (
              <StepCard
                key={item.step.id}
                step={item.step}
                index={item.stepIndex}
                status={status}
                resources={resourcesByStep[item.step.id] ?? []}
                railFilledAbove={prevStep ? isDone(prevStep.id) : false}
                isLast={i === trail.length - 1}
                onStatusChange={(s) => void setStepStatus(item.step.id, s)}
                defaultOpen={
                  targetStepId
                    ? targetStepId === item.step.id
                    : nextStep?.id === item.step.id
                }
                highlighted={targetStepId === item.step.id}
                revealDelay={delay}
              />
            );
          }
          const achieved = achievedMilestones[item.milestone.id] ?? null;
          return (
            <MilestoneMarker
              key={item.milestone.id}
              title={item.milestone.title}
              description={item.milestone.description}
              achievedAt={achieved?.achieved_at ?? null}
              railFilled={isDone(item.anchorStepId)}
              revealDelay={delay}
            />
          );
        })}
      </ol>

      {trail.length === 0 && !error && (
        <div className="mt-10 rounded-2xl border border-dashed border-mist bg-card p-8 text-center">
          <p className="font-display text-lg font-bold">No steps yet</p>
          <p className="mt-1 text-sm text-fog">
            This skill's roadmap hasn't been published. Check back soon.
          </p>
        </div>
      )}
    </AppShell>
  );
}

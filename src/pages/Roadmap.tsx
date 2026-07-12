import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { LoadingScreen } from "../components/LoadingScreen";
import { MilestoneCard, StepCard } from "../components/StepCard";
import { useRoadmap } from "../hooks/useRoadmap";
import { logEvent } from "../lib/analytics";
import type { GalaxyNodeInput } from "../components/GalaxyRoadmap";
import type { Milestone, RoadmapStep, StepLevel } from "../lib/types";

// The three.js bundle loads only when the galaxy view is opened.
const GalaxyRoadmap = lazy(() => import("../components/GalaxyRoadmap"));

const VIEW_KEY = "sv-roadmap-view";

/** Galaxy needs WebGL and the user not preferring reduced motion. */
function detectGalaxyCapable(): boolean {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

interface StageGroup {
  key: string;
  title: string;
  steps: RoadmapStep[];
  milestone: Milestone | null;
}

// Fallback stage titles when migration 0006 (stages) hasn't been applied yet.
const LEVEL_FALLBACK_TITLES: Record<StepLevel, string> = {
  beginner: "Foundations",
  intermediate: "Building up",
  advanced: "Going deep",
};

export function RoadmapPage() {
  const {
    skill,
    steps,
    stages,
    milestones,
    resourcesByStep,
    progressByStep,
    achievedMilestones,
    loading,
    error,
    setStepStatus,
    completeMilestone,
    doneCount,
    totalCount,
    progressPercent,
    nextStep,
  } = useRoadmap();
  const location = useLocation();

  // Galaxy vs flat view — flat is always the accessible default/fallback.
  const [galaxyCapable] = useState(detectGalaxyCapable);
  const [viewPref, setViewPref] = useState<"flat" | "galaxy">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "galaxy" ? "galaxy" : "flat";
    } catch {
      return "flat";
    }
  });
  const view = galaxyCapable && viewPref === "galaxy" ? "galaxy" : "flat";
  const setView = (v: "flat" | "galaxy") => {
    setViewPref(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };

  // Node selected inside the galaxy → detail overlay.
  const [selected, setSelected] = useState<GalaxyNodeInput | null>(null);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // Funnel: one roadmap_viewed event per visit.
  useEffect(() => {
    logEvent("roadmap_viewed");
  }, []);

  // Step targeted by a dashboard deep link (/roadmap#step-<id>).
  const targetStepId = location.hash.startsWith("#step-")
    ? location.hash.slice("#step-".length)
    : null;

  const isDone = (stepId: string) =>
    progressByStep[stepId]?.status === "done";

  // Group steps into stages; each stage ends with its milestone (anchored to
  // one of the stage's steps). Falls back to difficulty tiers pre-0006.
  const stageGroups = useMemo<StageGroup[]>(() => {
    const groups: StageGroup[] = [];
    if (stages.length > 0) {
      for (const st of stages) {
        groups.push({
          key: st.id,
          title: st.title,
          steps: steps.filter((s) => s.stage_id === st.id),
          milestone: null,
        });
      }
      const orphans = steps.filter(
        (s) => !stages.some((st) => st.id === s.stage_id),
      );
      if (orphans.length) {
        groups.push({ key: "extra", title: "More steps", steps: orphans, milestone: null });
      }
    } else {
      for (const level of ["beginner", "intermediate", "advanced"] as StepLevel[]) {
        const levelSteps = steps.filter((s) => (s.level ?? "beginner") === level);
        if (levelSteps.length) {
          groups.push({
            key: level,
            title: LEVEL_FALLBACK_TITLES[level],
            steps: levelSteps,
            milestone: null,
          });
        }
      }
    }
    for (const g of groups) {
      g.milestone =
        milestones.find((m) => g.steps.some((s) => s.id === m.after_step_id)) ?? null;
    }
    return groups.filter((g) => g.steps.length > 0);
  }, [stages, steps, milestones]);

  // A milestone unlocks once every step up to its anchor is done (the DB
  // insert policy re-verifies this server-side).
  const milestoneUnlocked = (m: Milestone) => {
    const anchor = steps.find((s) => s.id === m.after_step_id);
    if (!anchor) return false;
    return steps
      .filter((s) => s.order_index <= anchor.order_index)
      .every((s) => isDone(s.id));
  };

  // Steps + milestones flattened in journey order for the galaxy view.
  const galaxyNodes = useMemo<GalaxyNodeInput[]>(() => {
    const out: GalaxyNodeInput[] = [];
    stageGroups.forEach((g, gi) => {
      for (const s of g.steps) {
        out.push({
          kind: "step",
          id: s.id,
          title: s.title,
          badge: String(s.order_index).padStart(2, "0"),
          stageIndex: gi,
          state:
            progressByStep[s.id]?.status === "done"
              ? "done"
              : nextStep?.id === s.id
                ? "current"
                : "todo",
        });
      }
      if (g.milestone) {
        out.push({
          kind: "milestone",
          id: g.milestone.id,
          title: g.milestone.title,
          badge: "★",
          stageIndex: gi,
          state: achievedMilestones[g.milestone.id]
            ? "achieved"
            : milestoneUnlocked(g.milestone)
              ? "unlocked"
              : "locked",
        });
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageGroups, progressByStep, achievedMilestones, nextStep, steps]);

  const selectedStep =
    selected?.kind === "step" ? steps.find((s) => s.id === selected.id) ?? null : null;
  const selectedMilestone =
    selected?.kind === "milestone"
      ? milestones.find((m) => m.id === selected.id) ?? null
      : null;

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

  return (
    <AppShell>
      {/* Galaxy mode renders over a dark fixed canvas — scope the dark
          design tokens to this page so the header/overlay stay readable. */}
      <div className={view === "galaxy" ? "dark" : ""}>
      <header className="reveal relative z-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Roadmap</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
              {skill?.title ?? "Your roadmap"}
            </h1>
          </div>
          {galaxyCapable && (
            <div
              role="radiogroup"
              aria-label="Roadmap view"
              className="inline-flex rounded-lg border border-mist bg-card p-0.5"
            >
              {(["flat", "galaxy"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wide transition-all ${
                    view === v
                      ? "pop bg-jade-tint text-jade-deep"
                      : "text-fog hover:text-pine"
                  }`}
                >
                  {v === "flat" ? "List" : "✦ Galaxy"}
                </button>
              ))}
            </div>
          )}
        </div>
        {skill?.description && (
          <p className="mt-2 max-w-xl leading-relaxed text-fog">{skill.description}</p>
        )}

        {/* Overall progress */}
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
        <p role="alert" className="relative z-10 mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {view === "galaxy" && (
        <Suspense
          fallback={
            <div className="relative z-10">
              <LoadingScreen label="Charting the galaxy" />
            </div>
          }
        >
          <GalaxyRoadmap
            key={galaxyNodes.map((n) => n.id).join("|")}
            nodes={galaxyNodes}
            stageTitles={stageGroups.map((g) => g.title)}
            onSelect={setSelected}
          />
        </Suspense>
      )}

      {view === "flat" && stageGroups.map((group, gi) => {
        const doneInStage = group.steps.filter((s) => isDone(s.id)).length;
        const stagePercent = Math.round((doneInStage / group.steps.length) * 100);
        const headingId = `stage-heading-${group.key}`;
        return (
          <section key={group.key} aria-labelledby={headingId} className="mt-10">
            <header className="reveal" style={{ animationDelay: `${gi * 60}ms` }}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="eyebrow">Stage {gi + 1}</p>
                  <h2 id={headingId} className="mt-0.5 font-display text-xl font-extrabold tracking-tight">
                    {group.title}
                  </h2>
                </div>
                <span className="font-mono text-xs text-fog">
                  {doneInStage} / {group.steps.length} steps
                </span>
              </div>
              <div
                className="mt-3 h-1 overflow-hidden rounded-full bg-mist"
                role="progressbar"
                aria-valuenow={stagePercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${group.title} progress`}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                    stagePercent === 100 ? "bg-marigold" : "bg-jade"
                  }`}
                  style={{ width: `${stagePercent}%` }}
                />
              </div>
            </header>

            <ol className="mt-5 list-none">
              {group.steps.map((step, i) => {
                const status = progressByStep[step.id]?.status ?? "not_started";
                const prevStep = group.steps[i - 1];
                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={i}
                    status={status}
                    resources={resourcesByStep[step.id] ?? []}
                    railFilledAbove={prevStep ? isDone(prevStep.id) : false}
                    isLast={i === group.steps.length - 1}
                    onStatusChange={(s) => void setStepStatus(step.id, s)}
                    defaultOpen={
                      targetStepId
                        ? targetStepId === step.id
                        : nextStep?.id === step.id
                    }
                    highlighted={targetStepId === step.id}
                    revealDelay={Math.min(i * 40, 320)}
                  />
                );
              })}
              {group.milestone && (
                <MilestoneCard
                  milestone={group.milestone}
                  achievedAt={
                    achievedMilestones[group.milestone.id]?.achieved_at ?? null
                  }
                  unlocked={milestoneUnlocked(group.milestone)}
                  onComplete={() => completeMilestone(group.milestone!.id)}
                  revealDelay={Math.min(group.steps.length * 40, 360)}
                />
              )}
            </ol>
          </section>
        );
      })}

      {stageGroups.length === 0 && !error && (
        <div className="mt-10 rounded-2xl border border-dashed border-mist bg-card p-8 text-center">
          <p className="font-display text-lg font-bold">No steps yet</p>
          <p className="mt-1 text-sm text-fog">
            This skill's roadmap hasn't been published. Check back soon.
          </p>
        </div>
      )}

      {/* Galaxy node detail: bottom sheet on mobile, side panel on desktop.
          Reuses the exact flat-view cards, so status/AI/milestone actions
          work identically. */}
      {selected && (selectedStep || selectedMilestone) && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={selected.title}>
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setSelected(null)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div className="reveal absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-3xl bg-paper p-4 pb-8 shadow-lift md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-none md:w-[480px] md:rounded-none md:rounded-l-3xl md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">
                {selected.kind === "milestone" ? "Milestone" : `Step ${selected.badge}`}
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close details"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-fog transition-colors hover:bg-mist/60 hover:text-pine"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {selectedStep && (
              <StepCard
                bare
                step={selectedStep}
                index={0}
                status={progressByStep[selectedStep.id]?.status ?? "not_started"}
                resources={resourcesByStep[selectedStep.id] ?? []}
                railFilledAbove={false}
                isLast
                onStatusChange={(s) => void setStepStatus(selectedStep.id, s)}
                defaultOpen
              />
            )}
            {selectedMilestone && (
              <MilestoneCard
                bare
                milestone={selectedMilestone}
                achievedAt={achievedMilestones[selectedMilestone.id]?.achieved_at ?? null}
                unlocked={milestoneUnlocked(selectedMilestone)}
                onComplete={() => completeMilestone(selectedMilestone.id)}
              />
            )}
          </div>
        </div>
      )}
      </div>
    </AppShell>
  );
}

import { useId, useState } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "../context/ToastContext";
import { friendlyError, RATE_LIMITED } from "../lib/messages";
import type { Milestone, Resource, RoadmapStep, StepLevel, StepStatus } from "../lib/types";

const statusLabels: Record<StepStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

const statusChip: Record<StepStatus, string> = {
  not_started: "bg-paper text-fog",
  in_progress: "bg-marigold-tint text-marigold-ink",
  done: "bg-jade-tint text-jade-deep",
};

const difficultyChip: Record<StepLevel, string> = {
  beginner: "bg-jade-tint text-jade-deep",
  intermediate: "bg-marigold-tint text-marigold-ink",
  advanced: "bg-abyss text-glow",
};

type AiMode = "simplify" | "quiz";

/** Calls the explain-step Edge Function — AI runs server-side only. */
async function askAi(stepId: string, mode: AiMode): Promise<{ text?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("explain-step", {
    body: { step_id: stepId, mode },
  });
  if (error) {
    // Try to map the function's safe { code } shape (e.g. rate_limited).
    try {
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? await ctx.json() : null;
      if (body?.code === "rate_limited") return { error: RATE_LIMITED };
    } catch {
      /* fall through to generic mapping */
    }
    return { error: friendlyError(error, "The AI helper is unavailable right now. Please try again.") };
  }
  const text = typeof (data as { result?: unknown })?.result === "string"
    ? ((data as { result: string }).result).slice(0, 4000)
    : null;
  if (!text) return { error: "The AI helper is unavailable right now. Please try again." };
  return { text };
}

interface StepCardProps {
  step: RoadmapStep;
  index: number;
  status: StepStatus;
  resources: Resource[];
  /** Whether the rail segment above this node should render as filled. */
  railFilledAbove: boolean;
  isLast: boolean;
  onStatusChange: (status: StepStatus) => void;
  defaultOpen?: boolean;
  /** Pulse the card once when reached via a dashboard deep link. */
  highlighted?: boolean;
  /** Render just the card (no trail rail / list markup) — used in the
   *  galaxy view's detail overlay. */
  bare?: boolean;
  revealDelay?: number;
}

export function StepCard({
  step,
  index,
  status,
  resources,
  railFilledAbove,
  isLast,
  onStatusChange,
  defaultOpen = false,
  highlighted = false,
  bare = false,
  revealDelay = 0,
}: StepCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [aiBusy, setAiBusy] = useState<AiMode | null>(null);
  const [aiResult, setAiResult] = useState<{ mode: AiMode; text: string } | null>(null);
  const { toast } = useToast();
  const detailsId = useId();
  const done = status === "done";
  const level = step.level ?? "beginner";
  const subtopics = Array.isArray(step.subtopics)
    ? step.subtopics.filter((s): s is string => typeof s === "string").slice(0, 8)
    : [];

  const runAi = async (mode: AiMode) => {
    if (aiBusy) return;
    setAiBusy(mode);
    const { text, error } = await askAi(step.id, mode);
    setAiBusy(null);
    if (error || !text) {
      toast(error ?? "The AI helper is unavailable right now. Please try again.", "error");
      return;
    }
    setAiResult({ mode, text });
  };

  const Root = bare ? "div" : "li";
  return (
    <Root
      className={bare ? "block" : "reveal relative flex gap-4 sm:gap-5"}
      style={bare ? undefined : { animationDelay: `${revealDelay}ms` }}
      id={bare ? undefined : `step-${step.id}`}
    >
      {/* Trail rail + node */}
      {!bare && (
      <div className="flex w-10 flex-none flex-col items-center sm:w-12">
        <div
          aria-hidden
          className={`h-2 w-0.5 flex-none ${
            index === 0 ? "bg-transparent" : railFilledAbove ? "bg-jade" : "bg-mist"
          }`}
        />
        <div
          aria-hidden
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-full border-2 font-mono text-xs font-semibold transition-colors duration-300 ${
            done
              ? "border-jade bg-jade text-white"
              : status === "in_progress"
                ? "border-jade bg-card text-jade-deep"
                : "border-mist bg-card text-fog"
          }`}
        >
          {done ? <CheckIcon /> : String(step.order_index).padStart(2, "0")}
        </div>
        {!isLast && (
          <div
            aria-hidden
            className={`w-0.5 flex-1 transition-colors duration-500 ${
              done ? "bg-jade" : "bg-mist"
            }`}
          />
        )}
      </div>
      )}

      {/* Card */}
      <div className={`min-w-0 flex-1 ${bare ? "" : "mb-4"}`}>
        <div
          className={`rounded-2xl border bg-card shadow-card transition-shadow ${
            done ? "border-jade/30" : "border-mist"
          } ${open ? "shadow-lift" : "hover:shadow-lift"} ${
            highlighted ? "deeplink-pulse" : ""
          }`}
        >
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-start justify-between gap-3 rounded-2xl px-4 py-4 text-left sm:px-5"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3
                  className={`font-display text-[17px] font-bold leading-snug ${
                    done ? "text-fog line-through decoration-jade/50" : ""
                  }`}
                >
                  {step.title}
                </h3>
                {step.estimated_hours != null && (
                  <span className="eyebrow whitespace-nowrap">
                    ~{step.estimated_hours}h
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${difficultyChip[level]}`}
                >
                  {level}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${statusChip[status]}`}
                >
                  {statusLabels[status]}
                </span>
              </div>
              {step.description && (
                <p className="mt-1.5 text-sm leading-relaxed text-fog">
                  {step.description}
                </p>
              )}
            </div>
            <ChevronIcon open={open} />
          </button>

          <div
            id={detailsId}
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <div className="border-t border-mist/70 px-4 pb-4 pt-4 sm:px-5">
                {step.ai_explanation && (
                  <div className="rounded-xl bg-jade-tint/60 p-4">
                    <div className="eyebrow mb-2 text-jade-deep">
                      Why it matters
                    </div>
                    <p className="text-sm leading-relaxed text-pinesoft">
                      {step.ai_explanation}
                    </p>
                  </div>
                )}

                {subtopics.length > 0 && (
                  <div className="mt-4">
                    <div className="eyebrow mb-2">What you'll learn</div>
                    <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                      {subtopics.map((topic) => (
                        <li key={topic} className="flex items-start gap-2 text-sm text-pinesoft">
                          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-jade" />
                          {topic}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resources.length > 0 && (
                  <div className="mt-4">
                    <div className="eyebrow mb-2">Free resources</div>
                    <ul className="space-y-1.5">
                      {resources.map((r) => (
                        <ResourceRow key={r.id} resource={r} />
                      ))}
                    </ul>
                  </div>
                )}

                {step.checkpoint && (
                  <div className="mt-4 rounded-xl border border-marigold/40 bg-marigold-tint p-4">
                    <div className="eyebrow mb-1.5 flex items-center gap-1.5 text-marigold-ink">
                      <TargetIcon /> Checkpoint
                    </div>
                    <p className="text-sm leading-relaxed text-marigold-ink">
                      {step.checkpoint}
                    </p>
                  </div>
                )}

                {/* AI helpers — always via the server-side Edge Function. */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void runAi("simplify")}
                    disabled={aiBusy !== null}
                    className="btn-ghost !px-3.5 !py-2 text-sm"
                  >
                    <SparkleIcon />
                    {aiBusy === "simplify" ? "Thinking…" : "Explain this differently"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAi("quiz")}
                    disabled={aiBusy !== null}
                    className="btn-ghost !px-3.5 !py-2 text-sm"
                  >
                    <QuizIcon />
                    {aiBusy === "quiz" ? "Writing questions…" : "Quiz me"}
                  </button>
                </div>

                {aiResult && (
                  <div
                    role="region"
                    aria-label={aiResult.mode === "quiz" ? "Quiz questions" : "Simpler explanation"}
                    className="mt-3 rounded-xl border border-mist bg-paper p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="eyebrow">
                        {aiResult.mode === "quiz" ? "Quick quiz — test yourself" : "In other words"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAiResult(null)}
                        aria-label="Dismiss AI response"
                        className="text-xs font-medium text-fog hover:text-pine"
                      >
                        Dismiss
                      </button>
                    </div>
                    {aiResult.mode === "quiz" ? (
                      <ol className="space-y-2">
                        {aiResult.text
                          .split("\n")
                          .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
                          .filter(Boolean)
                          .map((q, i) => (
                            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-pinesoft">
                              <span className="font-mono text-xs font-semibold text-jade-deep">
                                {i + 1}.
                              </span>
                              {q}
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p className="text-sm leading-relaxed text-pinesoft">{aiResult.text}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-mist/70 px-4 py-3 sm:px-5">
            <StatusControl value={status} onChange={onStatusChange} />
          </div>
        </div>
      </div>
    </Root>
  );
}

function ResourceRow({ resource }: { resource: Resource }) {
  return (
    <li>
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-paper"
      >
        <span className="font-mono text-[10px] font-medium uppercase tracking-wide text-fog border border-mist rounded px-1.5 py-0.5 flex-none w-14 text-center">
          {resource.type}
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-pine group-hover:text-jade-deep">
          {resource.title}
        </span>
        {resource.source && (
          <span className="ml-auto hidden flex-none text-xs text-fog sm:block">
            {resource.source}
          </span>
        )}
      </a>
    </li>
  );
}

export function StatusControl({
  value,
  onChange,
}: {
  value: StepStatus;
  onChange: (s: StepStatus) => void;
}) {
  const options: StepStatus[] = ["not_started", "in_progress", "done"];
  return (
    <div
      role="radiogroup"
      aria-label="Step status"
      className="inline-flex max-w-full flex-wrap rounded-lg border border-mist bg-paper p-0.5"
    >
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={`rounded-md px-2 py-1.5 font-mono text-[10px] font-medium uppercase tracking-wide transition-all sm:px-3 sm:text-[11px] ${
              active
                ? opt === "done"
                  ? "pop bg-jade text-white"
                  : opt === "in_progress"
                    ? "pop bg-marigold-tint text-marigold-ink"
                    : "pop bg-card text-pine shadow-card"
                : "text-fog hover:text-pine"
            }`}
          >
            {statusLabels[opt]}
          </button>
        );
      })}
    </div>
  );
}

interface MilestoneCardProps {
  milestone: Milestone;
  achievedAt: string | null;
  /** All prerequisite steps done — the project can be marked complete. */
  unlocked: boolean;
  onComplete: () => Promise<boolean>;
  /** Render as a plain block (galaxy overlay) instead of a list item. */
  bare?: boolean;
  revealDelay?: number;
}

/**
 * Stage-ending milestone: a celebratory project card, not a checkbox. The
 * user marks the project done themselves; the DB re-verifies it's unlocked.
 */
export function MilestoneCard({
  milestone,
  achievedAt,
  unlocked,
  onComplete,
  bare = false,
  revealDelay = 0,
}: MilestoneCardProps) {
  const [busy, setBusy] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const { toast } = useToast();
  const achieved = achievedAt !== null;

  const complete = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onComplete();
    setBusy(false);
    if (!ok) {
      toast("Couldn't save the milestone. Please try again.", "error");
      return;
    }
    setJustCompleted(true);
    toast("Milestone complete");
  };

  const Root = bare ? "div" : "li";
  return (
    <Root
      className={bare ? "relative block" : "reveal relative mb-6 mt-1 list-none"}
      style={bare ? undefined : { animationDelay: `${revealDelay}ms` }}
    >
      <div
        className={`relative overflow-hidden rounded-3xl border-2 p-5 transition-colors sm:p-6 ${
          achieved
            ? "border-marigold bg-marigold-tint"
            : unlocked
              ? "border-marigold/60 bg-card shadow-lift"
              : "border-dashed border-mist bg-paper"
        } ${justCompleted ? "milestone-pop" : ""}`}
      >
        {justCompleted && <SparkBurst />}
        <div className="flex items-start justify-between gap-3">
          <div className="eyebrow flex items-center gap-1.5 text-marigold-ink">
            <FlagIcon /> Milestone
          </div>
          {achieved && (
            <span className="flex-none whitespace-nowrap rounded-full bg-marigold px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
              Completed{" "}
              {new Date(achievedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
        <h3
          className={`mt-1.5 font-display text-xl font-bold ${
            achieved ? "text-marigold-ink" : unlocked ? "text-pine" : "text-fog"
          }`}
        >
          {milestone.title}
        </h3>
        {milestone.description && (
          <p className={`mt-0.5 text-sm ${achieved ? "text-marigold-ink/80" : "text-fog"}`}>
            {milestone.description}
          </p>
        )}

        {milestone.project_brief && (
          <div
            className={`mt-3 rounded-xl p-4 ${
              achieved ? "bg-card/60" : "bg-paper"
            } ${!achieved && !unlocked ? "opacity-70" : ""}`}
          >
            <div className="eyebrow mb-1.5 flex items-center gap-1.5">
              <HammerIcon /> The project
            </div>
            <p className="text-sm leading-relaxed text-pinesoft">
              {milestone.project_brief}
            </p>
          </div>
        )}

        {!achieved && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void complete()}
              disabled={!unlocked || busy}
              className="btn-primary !py-2.5 text-sm"
            >
              {busy ? "Saving…" : "Mark project complete"}
            </button>
            {!unlocked && (
              <span className="flex items-center gap-1.5 text-xs text-fog">
                <LockIcon /> Finish the steps above to unlock this project
              </span>
            )}
          </div>
        )}
      </div>
    </Root>
  );
}

/** Eight CSS sparks bursting from the card center on completion. */
function SparkBurst() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={i}
          className="spark absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-marigold"
          style={{ ["--spark-angle" as string]: `${i * 45}deg` }}
        />
      ))}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <path d="M5 12.5 10 17.5 19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={`mt-1 flex-none text-fog transition-transform duration-300 ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M5 21V4" strokeLinecap="round" />
      <path d="M5 4h12l-2.5 4L17 12H5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2ZM19 16l.9 2.6L22.5 19.5l-2.6.9L19 23l-.9-2.6-2.6-.9 2.6-.9L19 16Z" />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 9a3 3 0 1 1 4.4 2.6c-.9.5-1.4 1-1.4 2.4" strokeLinecap="round" />
      <circle cx="12" cy="17.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="10" strokeWidth="1.6" />
    </svg>
  );
}

function HammerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m14 6 6 6-2.5 2.5L15 12l-8.5 8.5a1.8 1.8 0 0 1-2.5-2.5L12.5 9.5 11 7l3-3 2.5 2.5L14 6Z" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

import { useId, useState } from "react";
import type { Resource, RoadmapStep, StepStatus } from "../lib/types";

const statusLabels: Record<StepStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

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
  revealDelay = 0,
}: StepCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const detailsId = useId();
  const done = status === "done";

  return (
    <li
      className="reveal relative flex gap-4 sm:gap-5"
      style={{ animationDelay: `${revealDelay}ms` }}
      id={`step-${step.id}`}
    >
      {/* Trail rail + node */}
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
          {done ? <CheckIcon /> : String(index + 1).padStart(2, "0")}
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

      {/* Card */}
      <div className="mb-4 min-w-0 flex-1">
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
              {step.description && (
                <p className="mt-1 text-sm leading-relaxed text-fog">
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
                      Why this step
                    </div>
                    <p className="text-sm leading-relaxed text-pinesoft">
                      {step.ai_explanation}
                    </p>
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
              </div>
            </div>
          </div>

          <div className="border-t border-mist/70 px-4 py-3 sm:px-5">
            <StatusControl value={status} onChange={onStatusChange} />
          </div>
        </div>
      </div>
    </li>
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
      className="inline-flex rounded-lg border border-mist bg-paper p-0.5"
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
            className={`rounded-md px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wide transition-all ${
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

interface MilestoneMarkerProps {
  title: string;
  description: string | null;
  achievedAt: string | null;
  railFilled: boolean;
  revealDelay?: number;
}

export function MilestoneMarker({
  title,
  description,
  achievedAt,
  railFilled,
  revealDelay = 0,
}: MilestoneMarkerProps) {
  const achieved = achievedAt !== null;
  return (
    <li
      className="reveal relative flex gap-4 sm:gap-5"
      style={{ animationDelay: `${revealDelay}ms` }}
    >
      <div className="flex w-10 flex-none flex-col items-center sm:w-12">
        <div
          aria-hidden
          className={`w-0.5 h-2 flex-none ${railFilled ? "bg-jade" : "bg-mist"}`}
        />
        <div
          aria-hidden
          className={`flex h-9 w-9 flex-none rotate-45 items-center justify-center rounded-lg border-2 transition-colors ${
            achieved
              ? "border-marigold bg-marigold text-white"
              : "border-mist bg-card text-fog"
          }`}
        >
          <span className="-rotate-45">
            <FlagIcon />
          </span>
        </div>
        <div
          aria-hidden
          className={`w-0.5 flex-1 ${railFilled ? "bg-jade" : "bg-mist"}`}
        />
      </div>

      <div className="mb-4 min-w-0 flex-1">
        <div
          className={`rounded-2xl border px-4 py-3.5 sm:px-5 ${
            achieved
              ? "border-marigold/50 bg-marigold-tint"
              : "border-dashed border-mist bg-paper"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div
                className={`eyebrow ${achieved ? "text-marigold-ink" : ""}`}
              >
                Milestone
              </div>
              <h3
                className={`font-display text-base font-bold ${
                  achieved ? "text-marigold-ink" : "text-fog"
                }`}
              >
                {title}
              </h3>
              {description && (
                <p
                  className={`mt-0.5 text-sm ${
                    achieved ? "text-marigold-ink/80" : "text-fog"
                  }`}
                >
                  {description}
                </p>
              )}
            </div>
            {achieved && (
              <span className="flex-none whitespace-nowrap font-mono text-[11px] font-medium text-marigold-ink">
                {new Date(achievedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
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

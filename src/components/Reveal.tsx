import type { CSSProperties, ReactNode } from "react";
import { useInView } from "../hooks/useInView";

interface Props {
  children: ReactNode;
  /** Stagger delay in ms, applied once the element enters the viewport. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "section" | "li";
  ariaLabel?: string;
}

/**
 * Scroll-triggered entrance: content rises and fades in the first time it
 * scrolls into view. Motion is disabled globally via the reduced-motion
 * rules in index.css (transitions collapse to ~0ms).
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  style,
  as: Tag = "section",
  ariaLabel,
}: Props) {
  const { ref, inView } = useInView<HTMLElement>();

  return (
    <Tag
      ref={ref as never}
      aria-label={ariaLabel}
      className={`${className} transition-all duration-700 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
        inView ? "translate-y-0 opacity-100" : "translate-y-7 opacity-0"
      }`}
      style={{ ...style, transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

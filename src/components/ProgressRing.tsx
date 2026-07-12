import { useInView, useCountUp } from "../hooks/useInView";

interface Props {
  percent: number;
  size?: number;
  stroke?: number;
  label?: string;
}

/**
 * Circular progress indicator. The arc sweeps in with a gradient stroke and
 * the center number counts up the first time the ring scrolls into view.
 */
export function ProgressRing({
  percent,
  size = 148,
  stroke = 11,
  label = "complete",
}: Props) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const clamped = Math.min(Math.max(percent, 0), 100);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (inView ? clamped : 0) / 100);
  const shown = useCountUp(clamped, inView, 1100);

  // Endpoint dot position along the arc (matches the -90° rotation).
  const angle = ((inView ? clamped : 0) / 100) * 2 * Math.PI - Math.PI / 2;
  const dotX = size / 2 + radius * Math.cos(angle);
  const dotY = size / 2 + radius * Math.sin(angle);

  return (
    <div
      ref={ref}
      className="relative inline-flex items-center justify-center"
      role="img"
      aria-label={`${clamped}% of steps complete`}
    >
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0E8A62" />
            <stop offset="100%" stopColor="#2FC08D" />
          </linearGradient>
        </defs>
        <g className="-rotate-90 origin-center">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--ring-track)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-[1200ms] ease-out"
          />
        </g>
        {clamped > 0 && (
          <circle
            cx={dotX}
            cy={dotY}
            r={stroke / 2 + 1.5}
            fill="rgb(var(--c-card))"
            stroke="#0E8A62"
            strokeWidth="2.5"
            className="transition-all duration-[1200ms] ease-out"
          />
        )}
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-4xl font-extrabold leading-none tracking-tight">
          {shown}
          <span className="text-xl text-fog">%</span>
        </div>
        <div className="eyebrow mt-1.5">{label}</div>
      </div>
    </div>
  );
}

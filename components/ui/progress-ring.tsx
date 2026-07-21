import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressRingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current value. */
  value: number;
  /** Target value the ring fills toward. */
  max?: number;
  /** Outer diameter in px. */
  size?: number;
  /** Stroke width in px. */
  thickness?: number;
  /** Track + progress colors (any CSS color). Defaults: muted track, emerald fill. */
  trackColor?: string;
  progressColor?: string;
  /** Render content in the center (e.g. count, percent, icon). */
  children?: React.ReactNode;
}

/**
 * Accessible circular progress indicator. The visual heart of Cetele — a
 * dhikr item's ring that fills as the count climbs and "closes" on completion.
 */
export function ProgressRing({
  value,
  max = 100,
  size = 96,
  thickness = 10,
  trackColor = "var(--muted)",
  progressColor = "var(--primary)",
  className,
  children,
  ...props
}: ProgressRingProps) {
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - pct);
  const complete = pct >= 1;

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      {/* viewBox, not width/height: the ring's GEOMETRY stays in `size` units
          while its rendered box follows the wrapper, so a caller can scale it
          (e.g. to viewport height on a short phone) with CSS alone. */}
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={complete ? "var(--success)" : progressColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          style={{
            transition:
              "stroke-dashoffset var(--duration-slow) var(--ease-brand), stroke var(--duration-base)",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children}
      </div>
    </div>
  );
}

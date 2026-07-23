import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The horizontal completion bar. This exact track+fill had been hand-written at
 * five call sites (group overview x2, the consistency band, the welcome card,
 * the pair goal) — identical down to the transition — which is how a design
 * system stops looking designed.
 *
 * `tone="success"` is the "met" state: same bar, brighter green, always paired
 * with a ✓ or a label at the call site (§5 colour-blind safety — never colour
 * alone). The bar itself is decorative by default: callers render the number
 * beside it. Where it is the ONLY expression of the value, pass `role="img"`
 * and an `aria-label` (the welcome card does).
 */
const progressFillVariants = cva(
  "h-full rounded-full transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-brand)]",
  {
    variants: {
      tone: {
        primary: "bg-primary",
        success: "bg-success",
      },
    },
    defaultVariants: { tone: "primary" },
  },
);

export interface ProgressBarProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressFillVariants> {
  /** Current value. */
  value: number;
  /** Value the bar fills toward. Defaults to 100 (i.e. `value` is a percent). */
  max?: number;
}

export function ProgressBar({
  value,
  max = 100,
  tone,
  className,
  ...props
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;

  return (
    <div
      className={cn("h-2.5 overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={progressFillVariants({ tone })}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

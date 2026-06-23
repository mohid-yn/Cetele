import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  /** Small icon or emoji shown beside the value. */
  icon?: React.ReactNode;
  /** Optional supporting text under the value. */
  hint?: string;
}

/** Compact metric display: a big number with a label — streaks, totals, ranks. */
export function Stat({
  label,
  value,
  icon,
  hint,
  className,
  ...props
}: StatProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)} {...props}>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="flex items-center gap-1.5 font-display text-3xl leading-none font-bold text-foreground tabular-nums">
        {icon}
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

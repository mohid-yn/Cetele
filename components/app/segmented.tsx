"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { springGlide } from "@/lib/motion";

/** A segmented control (in-page tabs) — used to give Group clean sub-views. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  // Unique per instance, so two Segmenteds on a page don't share (and fight
  // over) the same sliding-highlight layout element.
  const layoutId = React.useId();

  return (
    <div
      role="tablist"
      aria-label="Section"
      className={cn("flex gap-1 rounded-xl bg-muted p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.div
                layoutId={layoutId}
                transition={springGlide}
                className="absolute inset-0 rounded-lg bg-card shadow-sm"
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

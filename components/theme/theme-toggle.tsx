"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "./theme-provider";
import { SunIcon, MoonIcon } from "@/components/demo/icons";

const OPTIONS: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

/**
 * Light / Dark control — a segmented pill with a single sliding "thumb" that
 * glides under the active option (one indicator, not a per-button snap). The
 * thumb is exactly one segment wide, so `translate-x-full` lands it on Dark.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  // Animate slides only after the first frame, so a dark-mode reload doesn't
  // visibly glide the thumb across on load (the theme settles post-hydration).
  const [animate, setAnimate] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "relative grid grid-cols-2 rounded-full bg-muted p-1",
        className,
      )}
    >
      {/* Sliding active thumb — one segment wide; rides under the selection. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-card shadow-sm ring-1 ring-border",
          animate &&
            "transition-transform duration-[var(--duration-base)] ease-[var(--ease-brand)]",
          isDark && "translate-x-full",
        )}
      />

      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4 transition-transform duration-[var(--duration-base)] ease-[var(--ease-brand)]",
                active ? "scale-100" : "scale-90",
              )}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}

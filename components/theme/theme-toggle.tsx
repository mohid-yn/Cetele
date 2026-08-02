"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { useTheme, type Theme } from "./theme-provider";
import { SunIcon, MoonIcon } from "@/components/app/icons";

const OPTIONS: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

/**
 * The compact form — one icon button that swaps between light and dark.
 *
 * Lives in the sidebar foot, where the labelled control below was a 224px pill
 * spelling out both options for what is a binary preference. It is a real
 * `Button` rather than another bespoke control, so it inherits the same edge,
 * hover, pressed, focus and disabled behaviour as every other button in the
 * app — which is the whole point of having a primitive.
 *
 * The NAME carries the state change ("Switch to dark theme"), so there is no
 * `aria-pressed`: a toggle takes a static name plus `aria-pressed`, or a
 * changing name alone, never both — the same double-negative that had a screen
 * reader announcing "Sound off, not pressed" on the count screen.
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const next = isDark ? "light" : "dark";

  return (
    <Button
      // `outline`, not `ghost`: it stands alone in the sidebar foot with no
      // neighbouring control to borrow context from, and a ghost icon with no
      // resting edge there is exactly the "baked into the background" read.
      variant="outline"
      size="icon-sm"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={className}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </Button>
  );
}

/**
 * Light / Dark control — a segmented pill with a single sliding "thumb" that
 * glides under the active option (one indicator, not a per-button snap). The
 * thumb is exactly one segment wide, so `translate-x-full` lands it on Dark.
 *
 * Kept for /profile, where a preference deserves its options named. Its shell
 * now matches `Segmented` exactly (same radius, track, thumb token and
 * padding): the two were the same control drawn twice, differing only by
 * accident — `rounded-full` vs `rounded-xl`, `bg-elevated` vs `bg-card`. The
 * SEMANTICS stay different on purpose, radiogroup here and tablist there, so
 * they cannot simply be merged.
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
        // Track is the recessed tier; the thumb below is one step ABOVE it in
        // BOTH themes. v1 used `bg-card` on `bg-muted`, which is lighter-on-
        // darker in light but DARKER-on-lighter in dark — so at night the
        // selected option read as pressed into the control rather than raised.
        // Radius and padding are Segmented's, so the two read as one family.
        "relative grid grid-cols-2 rounded-xl bg-muted p-1",
        className,
      )}
    >
      {/* Sliding active thumb — one segment wide; rides under the selection. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-elevated shadow-sm",
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
              // min-h-11 = 44px (was 32px, py-1.5). The two radios tile a
              // 2-col grid edge to edge, so height can't crowd a neighbour, and
              // the sliding thumb is inset-y-1 so it tracks the new height.
              "relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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

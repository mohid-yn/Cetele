"use client";

import * as React from "react";

/**
 * Tween a displayed number toward `value` whenever it changes — used for the
 * live group counter and tap totals so jumps feel alive rather than snapping.
 */
export function useAnimatedNumber(
  value: number,
  durationMs = 500,
  animateOnMount = false,
): number {
  // When animateOnMount, start at 0 so the first effect tweens 0 → value.
  const [display, setDisplay] = React.useState(animateOnMount ? 0 : value);
  const fromRef = React.useRef(animateOnMount ? 0 : value);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      fromRef.current = current;
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return display;
}

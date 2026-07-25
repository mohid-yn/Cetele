/**
 * The shared Motion vocabulary — the `motion` (Framer Motion) counterpart of the
 * CSS motion tokens in `app/globals.css`. Everything here MIRRORS those tokens so
 * the two systems stay one design language, not two:
 *
 *   --ease-brand:      cubic-bezier(0.22, 1, 0.36, 1) ← entrances (ease-out quint)
 *   --ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1)  ← earned celebrations ONLY
 *   --duration-fast: 150ms · --duration-base: 220ms · --duration-slow: 360ms
 *
 * The philosophy from globals.css holds: both eases are smooth ease-outs (real
 * objects decelerate, they don't bounce); the emphasized one is just a more
 * dramatic settle, reserved for earned/celebratory moments. Reduced motion is
 * handled globally by <MotionConfig reducedMotion="user"> in the root layout,
 * so nothing here needs to branch on it.
 */

import type { Transition, Variants } from "motion/react";

/**
 * The OS reduced-motion preference, for effects the CSS guard and MotionConfig
 * can't reach: the raw-canvas confetti (rAF, not CSS animation) and celebratory
 * vibration patterns. Plain feedback ticks (a tap's 18ms buzz) are feedback, not
 * motion — they don't branch on this.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Durations in SECONDS (Motion's unit), mirroring the ms tokens. */
export const DURATION = {
  fast: 0.15,
  base: 0.22,
  slow: 0.36,
} as const;

/** The entrance ease — same cubic-bezier as --ease-brand. */
export const EASE_BRAND = [0.22, 1, 0.36, 1] as const;

/** The emphasis ease — same cubic-bezier as --ease-emphasized (ease-out expo). */
export const EASE_EMPHASIZED = [0.16, 1, 0.3, 1] as const;

/** A calm ease-out tween for entrances/layout — the default for everything. */
export const easeBrand = (duration: number = DURATION.base): Transition => ({
  duration,
  ease: EASE_BRAND,
});

/**
 * The emphasis tween — a dramatic-but-smooth settle for earned/celebratory
 * moments (mirrors --ease-emphasized). No overshoot: the drama is in the
 * deceleration, not a bounce. Reserve for earned moments; everything routine
 * uses easeBrand.
 */
export const easeEmphasized = (
  duration: number = DURATION.slow,
): Transition => ({
  duration,
  ease: EASE_EMPHASIZED,
});

/**
 * A physical glide for shared-layout indicators (nav pill, tab highlight). It
 * should feel like a real object settling into place — high damping so it
 * arrives cleanly without a visible bounce (damping ratio ≈ 0.98), never the
 * springy overshoot that reads as dated.
 */
export const springGlide: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.9,
};

/** Fade + a small rise — the Motion equivalent of the `.rise-in` keyframe. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: easeBrand(DURATION.slow) },
};

/**
 * A stagger container + item pair for lists. The container orchestrates; each
 * item uses `fadeRise`. Children rise in one after another for a calm cascade.
 */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.02 },
  },
};

export const staggerItem: Variants = fadeRise;

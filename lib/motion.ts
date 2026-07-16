/**
 * The shared Motion vocabulary — the `motion` (Framer Motion) counterpart of the
 * CSS motion tokens in `app/globals.css`. Everything here MIRRORS those tokens so
 * the two systems stay one design language, not two:
 *
 *   --ease-brand:    cubic-bezier(0.22, 1, 0.36, 1)   ← entrances (ease-out)
 *   --ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1) ← earned celebrations ONLY
 *   --duration-fast: 150ms · --duration-base: 220ms · --duration-slow: 360ms
 *
 * The philosophy from globals.css holds: ease-out for entrances, a bit of bounce
 * ONLY for earned/celebratory moments. Reduced motion is handled globally by
 * <MotionConfig reducedMotion="user"> in the root layout, so nothing here needs
 * to branch on it.
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

/** A calm ease-out tween for entrances/layout — the default for everything. */
export const easeBrand = (duration: number = DURATION.base): Transition => ({
  duration,
  ease: EASE_BRAND,
});

/**
 * A gentle spring for shared-layout indicators (nav pill, tab highlight) — the
 * glide should feel physical but must not overshoot into the celebration
 * register, so this is critically-ish damped, not bouncy.
 */
export const springGlide: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.9,
};

/**
 * The celebration spring — the ONLY place a visible bounce belongs (mirrors
 * --ease-spring's overshoot). Reserve for earned moments.
 */
export const springCelebrate: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 18,
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

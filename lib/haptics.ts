/**
 * Tactile feedback — the tasbih-bead tick, and the flourish when a ring closes.
 *
 * Sibling to `lib/sound.ts`: same shape (named intents, never raw values at the
 * call site), same rule that feedback and celebration are different registers.
 *
 * **Android only, by design.** WebKit has never implemented the Vibration API
 * and has declined to on fingerprinting/battery grounds, so `navigator.vibrate`
 * is absent on iOS in Safari *and* in an installed PWA. Every function here
 * no-ops there rather than pretending otherwise. There is no iOS fallback: the
 * only known lever is toggling a `<input type="checkbox" switch>`, which is an
 * undocumented side effect Apple can remove at any release — not an API we can
 * build a core loop on.
 */

import { prefersReducedMotion } from "./motion";

/**
 * A vibration pattern alternates **vibrate, pause, vibrate…** starting with
 * vibrate — so a leading `0` spends the first (and often only audible) slot on
 * a zero-length buzz. Both patterns here used to lead with one, which quietly
 * collapsed the intended multi-buzz flourishes to a single short tick.
 */
const TICK = 18;
const FLOURISH_CLOSE: number[] = [40, 30, 60];

function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  );
}

/**
 * One tap = one bead. Pure FEEDBACK, so it does **not** branch on
 * reduced-motion: a tick confirming your own press is not an effect being
 * played at you.
 */
export function hapticTick(): void {
  if (!canVibrate()) return;
  navigator.vibrate(TICK);
}

/**
 * The ring closing. Celebration, not feedback — reduced-motion users get the
 * moment without the flourish. Fire it on the TRANSITION only; a buzz you can
 * summon by tapping an already-closed ring stops being a reward.
 */
export function hapticCelebrate(): void {
  if (!canVibrate() || prefersReducedMotion()) return;
  navigator.vibrate(FLOURISH_CLOSE);
}

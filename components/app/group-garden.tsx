"use client";

/**
 * Group garden (CET-17) — the collective living artefact, real.
 *
 * Cetele was all numbers and rings with no emotional/identity layer. A garden
 * the *whole circle* grows together fills that gap while reinforcing the moat
 * (the group, not a solo avatar) and suiting a worship context (jannah / gardens
 * beneath which rivers flow). When activity dips it goes calmly **dormant —
 * never dead or shaming** (D8).
 *
 * TWO LAYERS, and the split is the whole design (D49):
 *   · HEIGHT / stage — the durable signal, the circle's 30-day consistency.
 *     Slow on purpose, so a single good day can't fake an established garden.
 *   · BLOOMS / sun  — today. One plant per member, opening as each tends today;
 *     petals widen with the collective goal; the sun comes out when the circle
 *     closes the day, and is gone again tomorrow.
 * The durable layer alone gave nothing to come back for: a 30-day mean moves
 * ~3 points a day, so a whole circle's effort shifted a plant by ~12px of 84.
 * The day can only ADD — nothing here ever shrinks because someone missed.
 *
 * Stores nothing: every value is derived server-side by `gardenStage()` from
 * data the group page already had (30-day consistency + today's per-member
 * contributions), so the short-term layer cost no query and no migration.
 */

import * as React from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  GARDEN_STAGE_COPY,
  GARDEN_STAGE_LABEL,
  bloomCount,
  type Garden,
} from "@/lib/retention";

/**
 * One plant. HEIGHT is the durable layer (30-day vitality); BLOOM is today's —
 * it opens because a member tended today, not because the circle is generally
 * doing well. Splitting them is the point: the slow signal can't be faked by a
 * good day, and the day's signal is visible immediately instead of being
 * averaged into invisibility.
 */
function Plant({
  x,
  v,
  i,
  blooming,
  openness,
}: {
  x: number;
  v: number;
  i: number;
  /** This plant's member has logged something today. */
  blooming: boolean;
  /** 0..1 — the circle's progress toward today's goal; opens the flower. */
  openness: number;
}) {
  const ground = 118;
  const height = 14 + v * 70;
  const topY = ground - height;
  const midY = ground - height * 0.55;
  const dormant = v < 0.22;
  // Referenced as tokens INLINE rather than through utility classes: see the
  // garden block in globals.css for why (a colour that lives only in a
  // stylesheet rule renders black if the rule ever goes missing). The nested
  // fallback keeps the failure mode at "light-theme colour", never black.
  const stem = dormant
    ? "var(--garden-stem-resting, var(--color-primary-700))"
    : "var(--garden-stem, var(--color-primary-700))";
  const leaf = dormant
    ? "var(--garden-leaf-resting, var(--color-primary-600))"
    : "var(--garden-leaf, var(--color-primary-600))";

  // Outer group grows up from the soil on mount (staggered); inner group adds a
  // gentle perpetual sway. Both rotate/scale from the plant's base.
  const baseStyle: React.CSSProperties = {
    transformBox: "fill-box",
    transformOrigin: "center bottom",
  };

  return (
    <g
      style={{
        ...baseStyle,
        animation: `garden-grow var(--duration-slow) var(--ease-emphasized) both`,
        animationDelay: `${i * 70}ms`,
      }}
    >
      <g
        style={{
          ...baseStyle,
          animation: `sway ${4 + (i % 3) * 0.6}s ease-in-out infinite`,
          animationDelay: `${i * 130}ms`,
        }}
      >
        {/* stem */}
        <path
          d={`M${x} ${ground} Q ${x - 3} ${midY} ${x} ${topY}`}
          className="fill-none"
          stroke={stem}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* leaves */}
        <ellipse
          cx={x - 6}
          cy={midY}
          rx={6}
          ry={3}
          fill={leaf}
          transform={`rotate(-25 ${x - 6} ${midY})`}
        />
        <ellipse
          cx={x + 6}
          cy={midY - 8}
          rx={6}
          ry={3}
          fill={leaf}
          transform={`rotate(25 ${x + 6} ${midY - 8})`}
        />
        {/* crown: flower when blooming, bud when growing, sprout when dormant. */}
        {blooming ? (
          <g
            style={{
              ...baseStyle,
              transformOrigin: "center",
              animation: `bloom-pop var(--duration-slow) var(--ease-emphasized) both`,
            }}
          >
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse
                key={a}
                cx={x}
                cy={topY - 5}
                // Petals lengthen with the day's collective progress, so the
                // flower keeps opening as taps come in — the garden changes
                // through the day, not once when the first person logs.
                rx={3.4}
                ry={4 + openness * 3}
                className="fill-accent-400"
                transform={`rotate(${a} ${x} ${topY - 1})`}
              />
            ))}
            <circle cx={x} cy={topY - 1} r={3} className="fill-accent-600" />
          </g>
        ) : dormant ? (
          <circle cx={x} cy={topY} r={3} fill={leaf} />
        ) : (
          // A closed bud, not a lesser thing: this is a plant whose member
          // hasn't logged YET today. Nothing here says "missed" — the day is
          // still open, and D8 forbids dressing an absence up as a failure.
          <ellipse cx={x} cy={topY - 1} rx={5} ry={7} fill={leaf} />
        )}
      </g>
    </g>
  );
}

/**
 * Ambient sky scenery. Everything below is CONSTANT — identical whoever logged,
 * whatever the stage — and that is the whole licence for it existing: in this
 * illustration a mark normally makes a claim (a bloom means a named member
 * tended today, D49), so decoration that varied would be the picture telling a
 * story about people that the data does not support. Scenery that never changes
 * can be read as weather, and weather is nobody's fault.
 *
 * Entries above the viewBox (negative y) are deliberate: the card stretches to
 * match the task breakdown beside it, and `meet` spends the difference on sky,
 * so the taller it gets the more of these come into view. A bigger sky then
 * gains sky, instead of gaining emptiness.
 */
const CLOUDS = [
  { x: 62, y: 30, s: 1, dur: 82, delay: 0 },
  { x: 190, y: 17, s: 0.75, dur: 104, delay: -30 },
  { x: 236, y: 52, s: 0.6, dur: 94, delay: -60 },
  { x: 120, y: -28, s: 0.9, dur: 118, delay: -12 },
  { x: 250, y: -62, s: 0.7, dur: 96, delay: -45 },
];

const STARS = [
  { x: 44, y: 26, r: 1.1 },
  { x: 96, y: 14, r: 0.8 },
  { x: 150, y: 34, r: 0.95 },
  { x: 206, y: 20, r: 1 },
  { x: 243, y: 46, r: 0.7 },
  { x: 72, y: 54, r: 0.7 },
  { x: 172, y: 62, r: 0.6 },
  { x: 110, y: -22, r: 1 },
  { x: 200, y: -40, r: 0.8 },
  { x: 58, y: -54, r: 0.9 },
  { x: 256, y: -18, r: 0.7 },
];

/** Four overlapping ellipses — a soft mass, not an outlined cartoon cloud. */
function Cloud({
  x,
  y,
  s,
  dur,
  delay,
}: {
  x: number;
  y: number;
  s: number;
  dur: number;
  delay: number;
}) {
  return (
    // Position lives on the inner <g> as an attribute and the drift on the
    // outer as CSS: a CSS transform REPLACES the transform attribute outright,
    // so keeping them on one element would fling the cloud to the origin.
    <g
      style={{
        animation: `garden-drift ${dur}s ease-in-out ${delay}s infinite alternate`,
      }}
    >
      <g
        className="garden-clouds"
        transform={`translate(${x} ${y}) scale(${s})`}
      >
        <ellipse cx={0} cy={0} rx={13} ry={5.5} />
        <ellipse cx={-8} cy={1.5} rx={8.5} ry={4} />
        <ellipse cx={8.5} cy={1.5} rx={9.5} ry={4.5} />
        <ellipse cx={1.5} cy={-4} rx={7.5} ry={5} />
      </g>
    </g>
  );
}

export function GroupGarden({
  garden,
  className,
}: {
  garden: Garden;
  className?: string;
}) {
  const { stage, vitality, todayPct, tendedToday, memberCount, closedToday } =
    garden;

  // Gradient ids are document-global, so two gardens on one page would have the
  // second silently repaint the first. useId is per-instance; the strip keeps it
  // a legal url(#…) fragment.
  const skyId = `garden-sky-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // EXACTLY one plant per member, up to 12 — that is what makes a bloom mean
  // something specific ("a member tended today") rather than being decoration.
  // Deliberately not padded to a minimum: padding a 2-person circle up to 3
  // plants made 1-of-2 tending draw 2 of 3 blooms, i.e. the picture claimed
  // more people had shown up than had. Past 12 the count stops being literal
  // and the proportion carries it, with the caption stating the real numbers.
  const drawn = Math.max(1, Math.min(12, memberCount || 7));
  const blooms = bloomCount(tendedToday, memberCount, drawn);

  const plants = React.useMemo(() => {
    // Spacing is capped and the bed is CENTRED, so a small circle reads as a
    // small planting instead of two plants marooned at opposite edges. At 7
    // plants this is pixel-identical to the original fixed layout.
    const step = drawn > 1 ? Math.min(264 / (drawn - 1), 44) : 0;
    const left = (320 - step * (drawn - 1)) / 2;
    return Array.from({ length: drawn }, (_, i) => {
      const wobble = ((i * 37) % 10) / 10 - 0.45; // -0.45..0.45
      const v = Math.max(0, Math.min(1, vitality + wobble * 0.28));
      // Blooms are spread THROUGH the bed rather than packed at one end, so a
      // half-tended circle reads as a garden coming alive rather than a split
      // one. This is the even-distribution step (the same trick as drawing a
      // line on a grid): it yields exactly `blooms` of them, which a simpler
      // "every other plant" rule does not once blooms passes half of drawn.
      const blooming =
        Math.floor(((i + 1) * blooms) / drawn) >
        Math.floor((i * blooms) / drawn);
      return { x: Math.round(left + i * step), v, blooming };
    });
  }, [drawn, vitality, blooms]);

  return (
    <Card className={cn("flex flex-col overflow-hidden p-0", className)}>
      {/* The illustration holds its aspect ratio (matching the viewBox) as its
          NATURAL size — a fixed height + `w-full` once made a wide desktop card
          ~5:1 against a 2.46:1 scene, cropping the ground and plant bases away.
          On desktop this card sits beside the task breakdown, whose height is
          set by however many tasks the circle has, so it also has to be able to
          GROW: `grow` lets the scene take the row's spare height, and
          `xMidYMax meet` spends it on SKY (scale stays width-driven, the ground
          stays pinned to the bottom edge) instead of scaling up and cropping
          the bed. Nothing is ever cut off, at any card height. */}
      <svg
        viewBox="0 0 320 130"
        className="block aspect-[320/130] w-full grow"
        role="img"
        aria-label={`Group garden — ${GARDEN_STAGE_LABEL[stage]}`}
        preserveAspectRatio="xMidYMax meet"
      >
        <defs>
          {/* userSpaceOnUse, ending at the ground line: the ramp is pinned to
              the SCENE, not to the element box, so a stretched card pads the
              top tone (spreadMethod default) instead of stretching the ramp and
              washing the horizon out. Stops are themed in globals.css. */}
          <linearGradient
            id={skyId}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={0}
            y2={118}
          >
            <stop
              offset="0%"
              stopColor="var(--garden-sky-top, var(--color-primary-100))"
            />
            <stop
              offset="100%"
              stopColor="var(--garden-sky-horizon, var(--color-primary-50))"
            />
          </linearGradient>
        </defs>

        {/* Extends far ABOVE the viewBox on purpose: with `meet` the letterboxed
            band is still inside the viewport, so it paints rather than showing
            the card behind it — the sky simply gets taller. (An SVG clips to its
            viewport, not to its viewBox.) */}
        <rect x={0} y={-400} width={320} height={530} fill={`url(#${skyId})`} />

        {/* Day/night backdrop. Both are rendered and the THEME picks one, so
            there is no flash of the wrong sky and no client theme probe. */}
        {CLOUDS.map((c) => (
          <Cloud key={`${c.x}-${c.y}`} {...c} />
        ))}
        <g className="garden-stars">
          {STARS.map((s, i) => (
            <circle
              key={`${s.x}-${s.y}`}
              cx={s.x}
              cy={s.y}
              r={s.r}
              style={{
                // Coprime-ish periods so the field never pulses in unison.
                animation: `garden-twinkle ${7 + (i % 4) * 2.5}s ease-in-out ${i * 0.8}s infinite`,
              }}
            />
          ))}
        </g>
        {/* The sun marks TODAY being closed, not the durable stage it used to
            follow. A stage only turns over after weeks, so as a reward it was
            invisible; "the circle finished today" is earned, is visible the
            moment it happens, and is gone again tomorrow — which is exactly
            what makes it worth coming back for. */}
        {closedToday && (
          <circle
            cx={278}
            cy={30}
            r={16}
            className="fill-accent-300/60"
            style={{
              animation: `bloom-pop var(--duration-slow) var(--ease-emphasized) both`,
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
          />
        )}
        {/* Two hill bands behind the bed. They crest ABOVE the ground path's own
            high point (y=96 at centre) or they would simply be swallowed by it,
            and they are what turns a flat colour field into a place with a
            distance — depth the sky alone cannot give without getting loud. */}
        <path
          d="M0 94 Q 68 78 136 90 Q 206 102 258 86 Q 296 76 320 84 V130 H0 Z"
          className="garden-hill-far"
        />
        <path
          d="M0 100 Q 84 88 150 98 Q 214 108 272 94 Q 302 88 320 92 V130 H0 Z"
          className="garden-hill-near"
        />
        <path
          d="M0 110 Q 160 96 320 110 V130 H0 Z"
          className="garden-ground fill-primary-200/60"
        />
        <path
          d="M0 118 Q 160 106 320 118 V130 H0 Z"
          className="garden-soil fill-primary-300/50"
        />
        {plants.map((p, i) => (
          <Plant
            key={p.x}
            x={p.x}
            v={p.v}
            i={i}
            blooming={p.blooming}
            openness={todayPct}
          />
        ))}
      </svg>

      {/* Still no "+X% today" badge: the garden sits directly above Overview's
          "The circle today · X%" card, and the same number twice in one view is
          noise. The line below is a DIFFERENT fact — how many of you have shown
          up today — which is the thing the percentage cannot tell you and the
          reason to look again this evening. */}
      <div className="px-4 pt-3 pb-4">
        <h2 className="font-display text-base font-semibold text-foreground">
          Your circle&apos;s garden ·{" "}
          <span className="text-primary">{GARDEN_STAGE_LABEL[stage]}</span>
        </h2>
        <p className="mt-0.5 text-sm text-balance text-muted-foreground">
          {GARDEN_STAGE_COPY[stage]}
        </p>
        {memberCount > 0 && (
          <p className="mt-1.5 text-xs font-medium text-foreground/80">
            {closedToday ? (
              <>
                <span className="text-primary">All rings closed today</span> —
                the sun is out over your garden.
              </>
            ) : tendedToday > 0 ? (
              <>
                <span className="text-primary tabular-nums">
                  {tendedToday} of {memberCount}
                </span>{" "}
                {tendedToday === 1 ? "has" : "have"} tended the garden today.
              </>
            ) : (
              // Zero is stated as an open invitation, never as a scoreboard of
              // absence: nobody is named, and the sentence points forward (D8).
              <>Nobody has tended it yet today — the first bloom is yours.</>
            )}
          </p>
        )}
      </div>
    </Card>
  );
}

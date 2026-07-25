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
  const stemClass = dormant ? "stroke-primary-300" : "stroke-primary-600";
  const leafClass = dormant ? "fill-primary-200" : "fill-primary-500";

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
          className={cn("fill-none", stemClass)}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* leaves */}
        <ellipse
          cx={x - 6}
          cy={midY}
          rx={6}
          ry={3}
          className={leafClass}
          transform={`rotate(-25 ${x - 6} ${midY})`}
        />
        <ellipse
          cx={x + 6}
          cy={midY - 8}
          rx={6}
          ry={3}
          className={leafClass}
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
          <circle cx={x} cy={topY} r={3} className="fill-primary-300" />
        ) : (
          // A closed bud, not a lesser thing: this is a plant whose member
          // hasn't logged YET today. Nothing here says "missed" — the day is
          // still open, and D8 forbids dressing an absence up as a failure.
          <ellipse
            cx={x}
            cy={topY - 1}
            rx={5}
            ry={7}
            className="fill-primary-500"
          />
        )}
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
    <Card className={cn("overflow-hidden p-0", className)}>
      {/* Hold the illustration's own aspect ratio (matching the viewBox) so it
          scales proportionally with the card. A fixed height + `w-full` made a
          wide desktop card ~5:1 against a 2.46:1 scene, so `slice` zoomed ~2.3x
          and center-cropped the ground and plant bases into an empty sky. */}
      <svg
        viewBox="0 0 320 130"
        className="block aspect-[320/130] w-full"
        role="img"
        aria-label={`Group garden — ${GARDEN_STAGE_LABEL[stage]}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <rect
          x={0}
          y={0}
          width={320}
          height={130}
          className="garden-sky fill-primary-50"
        />
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

"use client";

/**
 * Group garden (CET-17) — the collective living artefact, real.
 *
 * Cetele was all numbers and rings with no emotional/identity layer. A garden
 * the *whole circle* grows together fills that gap while reinforcing the moat
 * (the group, not a solo avatar) and suiting a worship context (jannah / gardens
 * beneath which rivers flow). It grows with the circle's 30-day consistency and
 * today's effort; when activity dips it goes calmly **dormant — never dead or
 * shaming** (D8).
 *
 * Stores nothing: `stage`/`vitality` are derived server-side by
 * `gardenStage(group_consistency(g,30), todayPct)`.
 */

import * as React from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  GARDEN_STAGE_COPY,
  GARDEN_STAGE_LABEL,
  type Garden,
} from "@/lib/retention";

/** One plant, its growth scaled by a local vitality 0..1; grows in then sways. */
function Plant({ x, v, i }: { x: number; v: number; i: number }) {
  const ground = 118;
  const height = 14 + v * 70;
  const topY = ground - height;
  const midY = ground - height * 0.55;
  const dormant = v < 0.22;
  const blooming = v > 0.62;
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
        animation: `garden-grow var(--duration-slow) var(--ease-spring) both`,
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
              animation: `bloom-pop var(--duration-slow) var(--ease-spring) both`,
            }}
          >
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse
                key={a}
                cx={x}
                cy={topY - 5}
                rx={3.4}
                ry={6}
                className="fill-accent-400"
                transform={`rotate(${a} ${x} ${topY - 1})`}
              />
            ))}
            <circle cx={x} cy={topY - 1} r={3} className="fill-accent-600" />
          </g>
        ) : dormant ? (
          <circle cx={x} cy={topY} r={3} className="fill-primary-300" />
        ) : (
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
  const { stage, vitality } = garden;

  // Seven plants across the bed; per-plant variation so it reads organic, but
  // deterministic (index-based) so it never jitters between renders.
  const plants = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const wobble = ((i * 37) % 10) / 10 - 0.45; // -0.45..0.45
        const v = Math.max(0, Math.min(1, vitality + wobble * 0.28));
        return { x: 28 + i * 44, v };
      }),
    [vitality],
  );

  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      <svg
        viewBox="0 0 320 130"
        className="block h-36 w-full"
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
        {/* sun, only once the garden is thriving */}
        {stage >= 3 && (
          <circle cx={278} cy={30} r={16} className="fill-accent-300/60" />
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
          <Plant key={p.x} x={p.x} v={p.v} i={i} />
        ))}
      </svg>

      {/* No "+X% today" badge here, deliberately: the garden sits directly above
          Overview's "The circle today · X%" card, and today's progress stated
          twice in one view is noise. The garden's job is the part a number can't
          do — it SHOWS the day's effort, in the growth. */}
      <div className="px-4 pt-3 pb-4">
        <h2 className="font-display text-base font-semibold text-foreground">
          Your circle&apos;s garden ·{" "}
          <span className="text-primary">{GARDEN_STAGE_LABEL[stage]}</span>
        </h2>
        <p className="mt-0.5 text-sm text-balance text-muted-foreground">
          {GARDEN_STAGE_COPY[stage]}
        </p>
      </div>
    </Card>
  );
}

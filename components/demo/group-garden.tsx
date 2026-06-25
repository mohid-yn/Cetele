"use client";

/**
 * Group garden (CET-17) — the collective living artefact.
 *
 * Cetele was all numbers and rings with no emotional/identity layer. A garden
 * the *whole circle* grows together fills that gap while reinforcing the moat
 * (the group, not a solo avatar) and suiting a worship context (jannah / gardens
 * beneath which rivers flow). It grows with the group's recent consistency and
 * today's effort; when activity dips it goes calmly **dormant — never dead or
 * shaming** (D8). v1 is illustrative (CSS/SVG growth stages); a richer artefact
 * can follow.
 */

import * as React from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { useAnimatedNumber } from "./use-animated-number";

const STAGE_LABEL = ["Resting", "Sprouting", "Growing", "Flourishing"];
const STAGE_COPY = [
  "Quiet for now — a few rings today will wake it up. No rush, no guilt.",
  "First shoots. The circle is finding its rhythm.",
  "Coming alive — the garden grows every day you close your rings together.",
  "MashaAllah — your circle's garden is thriving. Keep tending it.",
];

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
        {/* crown: flower when blooming, bud when growing, sprout when dormant.
            The flower pops in (bloom-pop) when a plant crosses into bloom. */}
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

export function GroupGarden({ className }: { className?: string }) {
  const { state } = useMock();
  const group = sel.activeGroup(state);
  const { stage, vitality, todayPct } = sel.gardenStage(state, group.id);
  const todayShown = useAnimatedNumber(Math.round(todayPct * 100), 600, true);

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
        aria-label={`Group garden — ${STAGE_LABEL[stage]}`}
        preserveAspectRatio="xMidYMid slice"
      >
        {/* sky */}
        <rect
          x={0}
          y={0}
          width={320}
          height={130}
          className="fill-primary-50"
        />
        {/* sun, only once the garden is thriving */}
        {stage >= 3 && (
          <circle cx={278} cy={30} r={16} className="fill-accent-300/60" />
        )}
        {/* ground */}
        <path
          d="M0 110 Q 160 96 320 110 V130 H0 Z"
          className="fill-primary-200/60"
        />
        <path
          d="M0 118 Q 160 106 320 118 V130 H0 Z"
          className="fill-primary-300/50"
        />
        {plants.map((p, i) => (
          <Plant key={p.x} x={p.x} v={p.v} i={i} />
        ))}
      </svg>

      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-foreground">
            Your circle&apos;s garden ·{" "}
            <span className="text-primary">{STAGE_LABEL[stage]}</span>
          </h2>
          <p className="mt-0.5 text-sm text-balance text-muted-foreground">
            {STAGE_COPY[stage]}
          </p>
        </div>
        {todayPct > 0 && (
          <span className="shrink-0 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 tabular-nums">
            +{todayShown}% today
          </span>
        )}
      </div>
    </Card>
  );
}

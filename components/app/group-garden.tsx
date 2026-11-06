"use client";

/**
 * Group garden (CET-17) — v2, rebuilt as a reward loop.
 *
 * v1 was a correct picture with nothing to do and nothing to notice: stems and
 * identical flowers that were simply already in their new state when you
 * arrived. v2 keeps every v1 rule (one plant per member, the day only adds,
 * nothing dormant ever looks dead — D8, D49) and adds the moments, each one
 * mapped to a rule in `lib/garden.ts`:
 *
 *   · YOUR PLANT   — a fixed plot and a flower shape that are yours; tap any
 *                    plant to see whose it is.
 *   · THE SUN      — climbs over the hills as the circle nears today's goal,
 *                    fastest at the end (goal gradient). Closed = full sun,
 *                    turning rays, falling petals.
 *   · REPLAY       — what opened since you last looked (or live, while you
 *                    watch) bursts open in front of you, with a line saying who.
 *   · SURPRISES    — a seeded rare gold bloom, and a visitor on closed days.
 *   · NEXT STAGE   — a bar for how close the garden is to its next stage.
 *   · THE CUE      — your bud, if still closed, breathes and offers "Tend".
 *
 * Still stores nothing server-side. The only state is a per-viewer snapshot in
 * localStorage of what this viewer last saw — a convenience (losing it just
 * means no replay), never a source of truth.
 */

import * as React from "react";
import Link from "next/link";
import { Card, ProgressBar, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import { groupHref } from "@/lib/group-href";
import { hapticCelebrate, hapticTick } from "@/lib/haptics";
import {
  GARDEN_STAGE_COPY,
  GARDEN_STAGE_LABEL,
  bloomCount,
  type Garden,
} from "@/lib/retention";
import {
  NO_CHANGE,
  VISITOR_LABEL,
  arrangeBed,
  bloomKind,
  dailyVisitor,
  diffSince,
  isRareBloom,
  joinNames,
  parseSnapshot,
  petalTone,
  stageProgress,
  sunHeight,
  type BloomKind,
  type GardenDiff,
  type GardenMember,
  type GardenSnapshot,
  type VisitorKind,
} from "@/lib/garden";

const GROUND = 118;

/** Deterministic 0..1 noise, so SSR and client draw the same scenery. */
const noise = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const plotStyle: React.CSSProperties = {
  transformBox: "fill-box",
  transformOrigin: "center bottom",
};
const centreStyle: React.CSSProperties = {
  transformBox: "fill-box",
  transformOrigin: "center",
};

// ---------------------------------------------------------------------------
// Flowers
// ---------------------------------------------------------------------------

const PETAL = "var(--petal, var(--garden-petal-1))";
const CENTRE = "var(--garden-centre, var(--color-accent-700))";

/** One flower head, drawn around (0,0). `open` 0..1 widens it with the day. */
function FlowerHead({ kind, open }: { kind: BloomKind; open: number }) {
  const s = 1 + open * 0.4;
  switch (kind) {
    case "daisy":
      return (
        <g transform={`scale(${s})`}>
          {Array.from({ length: 9 }, (_, k) => (
            <ellipse
              key={k}
              cx={0}
              cy={-4.6}
              rx={1.7}
              ry={4.4}
              fill={PETAL}
              transform={`rotate(${k * 40})`}
            />
          ))}
          <circle r={2.6} fill={CENTRE} />
        </g>
      );
    case "tulip":
      return (
        <g transform={`scale(${s}) translate(0 3)`}>
          <path
            d="M-5.5 0 Q -6.5 -8 -3 -11 L 0 -7 L 3 -11 Q 6.5 -8 5.5 0 Q 0 4 -5.5 0 Z"
            fill={PETAL}
          />
          <path
            d="M0 -7 L 0 1.5"
            stroke={CENTRE}
            strokeWidth={1}
            strokeLinecap="round"
            opacity={0.55}
          />
        </g>
      );
    case "star":
      return (
        <g transform={`scale(${s})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <path
              key={a}
              d="M0 0 Q 3 -4.5 0 -9.5 Q -3 -4.5 0 0 Z"
              fill={PETAL}
              transform={`rotate(${a})`}
            />
          ))}
          <circle r={2.1} fill={CENTRE} />
        </g>
      );
    case "peony":
      return (
        <g transform={`scale(${s})`}>
          {Array.from({ length: 7 }, (_, k) => (
            <circle
              key={k}
              cx={Math.cos((k / 7) * Math.PI * 2) * 3.8}
              cy={Math.sin((k / 7) * Math.PI * 2) * 3.8}
              r={3.3}
              fill={PETAL}
            />
          ))}
          {Array.from({ length: 5 }, (_, k) => (
            <circle
              key={`i${k}`}
              cx={Math.cos((k / 5) * Math.PI * 2 + 0.6) * 1.7}
              cy={Math.sin((k / 5) * Math.PI * 2 + 0.6) * 1.7}
              r={2.5}
              style={{
                fill: `color-mix(in oklab, ${PETAL} 70%, ${CENTRE})`,
              }}
            />
          ))}
          <circle r={1.3} fill={CENTRE} />
        </g>
      );
  }
}

/** A closed bud, with a sliver of its own petal colour showing at the tip:
 *  you can see what it will open into, which is the anticipation. */
function Bud({ leaf }: { leaf: string }) {
  return (
    <g>
      <ellipse cx={0} cy={-1} rx={4.6} ry={6.6} fill={leaf} />
      <path
        d="M-2.2 -6.2 Q 0 -9.8 2.2 -6.2 Q 0 -4.6 -2.2 -6.2 Z"
        fill={PETAL}
      />
    </g>
  );
}

/** A four-point sparkle, centred on (0,0). */
function Sparkle({ r, fill }: { r: number; fill: string }) {
  const q = r * 0.28;
  return (
    <path
      d={`M0 ${-r} Q ${q} ${-q} ${r} 0 Q ${q} ${q} 0 ${r} Q ${-q} ${q} ${-r} 0 Q ${-q} ${-q} 0 ${-r} Z`}
      fill={fill}
    />
  );
}

/** Petals and sparkles thrown out of a fresh bloom. */
function Burst({ delay, seed }: { delay: number; seed: number }) {
  return (
    <g>
      <circle
        r={7}
        fill="none"
        stroke={PETAL}
        strokeWidth={1.2}
        style={{
          ...centreStyle,
          animation: `garden-ripple 900ms var(--ease-brand) ${delay}ms both`,
        }}
      />
      {Array.from({ length: 10 }, (_, k) => {
        const a = (k / 10) * Math.PI * 2 + noise(seed + k) * 0.5;
        const d = 14 + noise(seed + k * 3) * 12;
        return (
          <ellipse
            key={k}
            rx={1.4}
            ry={2.6}
            fill={
              k % 3 === 0
                ? "var(--garden-gold, var(--color-accent-200))"
                : PETAL
            }
            style={
              {
                ...centreStyle,
                "--dx": `${Math.cos(a) * d}px`,
                "--dy": `${Math.sin(a) * d - 6}px`,
                "--rot": `${(noise(seed + k) - 0.5) * 360}deg`,
                animation: `garden-burst 850ms var(--ease-brand) ${delay + 40}ms both`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// One plant
// ---------------------------------------------------------------------------

type PlantProps = {
  x: number;
  i: number;
  /** 0..1 durable vitality for this plant (height + foliage). */
  v: number;
  stage: number;
  blooming: boolean;
  openness: number;
  kind: BloomKind;
  tone: 1 | 2 | 3 | 4;
  rare: boolean;
  /** Opened since this viewer last looked — burst it open now. */
  fresh: boolean;
  freshDelay: number;
  isMe: boolean;
  /** The viewer's own plant, still a bud today: the cue to go and tend it. */
  waiting: boolean;
  selected: boolean;
  label: string | null;
  onSelect: (() => void) | null;
  /** Bumps to replay the grow-in animation (a stage-up). */
  growKey: number;
};

function Plant(p: PlantProps) {
  const dormant = p.v < 0.22;
  const height = 20 + p.v * 56;
  const topY = GROUND - height;
  const stem = dormant
    ? "var(--garden-stem-resting, var(--color-primary-700))"
    : "var(--garden-stem, var(--color-primary-700))";
  const leaf = dormant
    ? "var(--garden-leaf-resting, var(--color-primary-600))"
    : "var(--garden-leaf, var(--color-primary-600))";

  // Foliage fills in with the STAGE: a sprout, a young plant, a full one, a
  // branching one. The durable layer becomes something you can see change.
  const leafPairs = [2, 2, 3, 4][Math.max(0, Math.min(3, p.stage))];
  const leaves = Array.from({ length: leafPairs * 2 }, (_, k) => {
    const t = 0.18 + (k / (leafPairs * 2)) * 0.62;
    const side = k % 2 === 0 ? -1 : 1;
    const size = 1 - t * 0.35;
    return { y: GROUND - height * t, side, size, k };
  });
  const branch = p.stage >= 3 && !dormant;
  const branchY = GROUND - height * 0.58;
  const toneClass =
    p.rare && p.blooming ? "garden-tone-gold" : `garden-tone-${p.tone}`;
  const headY = topY - 4;

  const crown = (
    <g transform={`translate(${p.x} ${headY})`}>
      {p.blooming ? (
        <>
          {p.fresh && (
            <g
              style={{
                ...centreStyle,
                animation: `bud-give-way 520ms var(--ease-brand) ${p.freshDelay}ms both`,
              }}
            >
              <Bud leaf={leaf} />
            </g>
          )}
          <g
            style={{
              ...centreStyle,
              animation: p.fresh
                ? `bloom-burst 760ms var(--ease-emphasized) ${p.freshDelay + 260}ms both`
                : `bloom-pop var(--duration-slow) var(--ease-emphasized) ${p.i * 70 + 200}ms both`,
            }}
          >
            <FlowerHead kind={p.kind} open={p.openness} />
          </g>
          {p.fresh && <Burst delay={p.freshDelay + 300} seed={p.i * 17 + 3} />}
          {p.rare &&
            [
              [-9, -6, 0],
              [8, -9, 700],
              [10, 4, 1400],
            ].map(([dx, dy, d]) => (
              <g key={`${dx}`} transform={`translate(${dx} ${dy})`}>
                <g
                  style={{
                    ...centreStyle,
                    animation: `garden-shimmer 2.1s ease-in-out ${d}ms infinite`,
                  }}
                >
                  <Sparkle
                    r={2.6}
                    fill="var(--garden-gold, var(--color-accent-200))"
                  />
                </g>
              </g>
            ))}
        </>
      ) : dormant ? (
        // Resting is a smaller, quieter bud: still a plant about to flower,
        // never a bare stick (D8: dormant, not dead).
        <g transform="translate(0 2) scale(0.8)">
          <Bud leaf={leaf} />
        </g>
      ) : (
        // A closed bud, not a lesser thing: the day is still open (D8).
        <g
          style={
            p.waiting
              ? {
                  ...centreStyle,
                  animation: "bud-breathe 2.4s ease-in-out infinite",
                }
              : undefined
          }
        >
          <Bud leaf={leaf} />
        </g>
      )}
    </g>
  );

  const body = (
    <g
      key={p.growKey}
      style={{
        ...plotStyle,
        animation: `garden-grow var(--duration-slow) var(--ease-emphasized) both`,
        animationDelay: `${p.i * 70}ms`,
      }}
    >
      <g
        style={{
          ...plotStyle,
          animation: `sway ${4 + (p.i % 3) * 0.6}s ease-in-out infinite`,
          animationDelay: `${p.i * 130}ms`,
        }}
      >
        <path
          d={`M${p.x} ${GROUND} Q ${p.x - 3} ${GROUND - height * 0.5} ${p.x} ${topY}`}
          fill="none"
          stroke={stem}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        {branch && (
          <>
            <path
              d={`M${p.x - 1} ${branchY} Q ${p.x + 7} ${branchY - 4} ${p.x + 10} ${branchY - 12}`}
              fill="none"
              stroke={stem}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <g transform={`translate(${p.x + 10} ${branchY - 14}) scale(0.62)`}>
              {p.blooming ? (
                <FlowerHead kind={p.kind} open={p.openness} />
              ) : (
                <Bud leaf={leaf} />
              )}
            </g>
          </>
        )}
        {leaves.map((l) => (
          <path
            key={l.k}
            d="M0 0 Q 5 -4.6 11 0 Q 5 4.6 0 0 Z"
            fill={l.k % 3 === 2 ? stem : leaf}
            transform={`translate(${p.x + l.side * 0.5} ${l.y}) rotate(${l.side < 0 ? 205 : -25}) scale(${l.size * (dormant ? 0.85 : 1)})`}
          />
        ))}
        {crown}
      </g>
    </g>
  );

  return (
    <g
      className={cn(toneClass, p.onSelect && "garden-plot")}
      role={p.onSelect ? "button" : undefined}
      tabIndex={p.onSelect ? 0 : undefined}
      aria-label={p.label ?? undefined}
      aria-pressed={p.onSelect ? p.selected : undefined}
      onClick={p.onSelect ?? undefined}
      onKeyDown={
        p.onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                p.onSelect?.();
              }
            }
          : undefined
      }
    >
      {/* Generous invisible hit area: a stem is 2px wide. */}
      {p.onSelect && (
        <rect
          x={p.x - 12}
          y={topY - 16}
          width={24}
          height={height + 22}
          fill="transparent"
        />
      )}
      {/* Your plot, marked on the soil. Breathes while your bud is waiting. */}
      {p.isMe && (
        <ellipse
          cx={p.x}
          cy={GROUND + 1.5}
          rx={9}
          ry={2.6}
          fill="var(--garden-halo, var(--color-primary-400))"
          opacity={0.35}
          style={
            p.waiting
              ? { animation: "halo-breathe 2.4s ease-in-out infinite" }
              : undefined
          }
        />
      )}
      {(p.selected || p.onSelect) && (
        <ellipse
          className="garden-plot-focus"
          cx={p.x}
          cy={GROUND + 1.5}
          rx={11}
          ry={3.4}
          fill="none"
          stroke="var(--garden-ink, var(--foreground))"
          strokeWidth={1}
          opacity={p.selected ? 0.7 : 0}
        />
      )}
      {body}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

const CLOUDS = [
  { x: 62, y: 30, s: 1, dur: 82, delay: 0 },
  { x: 190, y: 17, s: 0.75, dur: 104, delay: -30 },
  { x: 120, y: -28, s: 0.9, dur: 118, delay: -12 },
  { x: 250, y: -62, s: 0.7, dur: 96, delay: -45 },
];

const STARS = [
  { x: 44, y: 26, r: 1.1 },
  { x: 96, y: 14, r: 0.8 },
  { x: 150, y: 34, r: 0.95 },
  { x: 206, y: 20, r: 1 },
  { x: 72, y: 54, r: 0.7 },
  { x: 172, y: 62, r: 0.6 },
  { x: 110, y: -22, r: 1 },
  { x: 200, y: -40, r: 0.8 },
  { x: 58, y: -54, r: 0.9 },
];

const TUFTS = Array.from({ length: 22 }, (_, k) => ({
  x: 6 + k * 14.6 + noise(k) * 6,
  y: GROUND + 2 + noise(k + 40) * 7,
  s: 0.7 + noise(k + 80) * 0.6,
}));

function Cloud({ x, y, s, dur, delay }: (typeof CLOUDS)[number]) {
  return (
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

/** The sun (a moon by night). Rises with the day's goal; drawn BEFORE the hills
 *  so at low progress it is genuinely behind them, peeking. */
function Sun({
  height,
  closed,
  celebrate,
}: {
  height: number;
  closed: boolean;
  celebrate: boolean;
}) {
  return (
    <g
      style={{
        transform: `translateY(${-height * 82}px)`,
        transition: "transform 1400ms var(--ease-brand)",
      }}
    >
      <g transform="translate(266 112)">
        <circle
          r={26}
          fill="var(--garden-sun-glow, var(--color-accent-100))"
          opacity={closed ? 0.55 : 0.35}
        />
        {closed && (
          <g
            style={{
              ...centreStyle,
              animation: celebrate
                ? "bloom-burst 900ms var(--ease-emphasized) both, garden-rays 60s linear 900ms infinite"
                : "garden-rays 60s linear infinite",
            }}
          >
            {Array.from({ length: 12 }, (_, k) => (
              <path
                key={k}
                d="M-2 -17 L 0 -25 L 2 -17 Z"
                fill="var(--garden-sun, var(--color-accent-200))"
                transform={`rotate(${k * 30})`}
              />
            ))}
          </g>
        )}
        <circle r={13} fill="var(--garden-sun, var(--color-accent-200))" />
      </g>
    </g>
  );
}

function Visitor({ kind, arriving }: { kind: VisitorKind; arriving: boolean }) {
  const gold = kind === "golden-butterfly";
  const wing = gold
    ? "var(--garden-gold)"
    : "var(--garden-wing, var(--color-accent-300))";
  const wingDeep = gold
    ? "var(--garden-gold-deep)"
    : "var(--garden-wing-deep, var(--color-accent-700))";
  const flap = (dur: number): React.CSSProperties => ({
    ...centreStyle,
    animation: `garden-flap ${dur}ms ease-in-out infinite`,
  });

  let body: React.ReactNode;
  if (kind === "bee") {
    body = (
      <>
        <g style={flap(140)}>
          <ellipse
            cx={-1}
            cy={-4}
            rx={3}
            ry={4}
            fill="var(--card)"
            opacity={0.85}
          />
          <ellipse
            cx={2}
            cy={-4}
            rx={3}
            ry={4}
            fill="var(--card)"
            opacity={0.85}
          />
        </g>
        <ellipse rx={5} ry={3.4} fill="var(--garden-bee)" />
        <path
          d="M-1.5 -3.2 V 3.2 M 1.5 -3.2 V 3.2"
          stroke="var(--garden-ink)"
          strokeWidth={1.2}
        />
        <circle cx={5} cy={-0.5} r={1.8} fill="var(--garden-ink)" />
      </>
    );
  } else if (kind === "bird") {
    body = (
      <>
        <ellipse rx={6.5} ry={4.2} fill="var(--garden-bird)" />
        <circle cx={5.5} cy={-3} r={3.2} fill="var(--garden-bird)" />
        <path
          d="M8.4 -3.4 L 11.5 -2.4 L 8.4 -1.6 Z"
          fill="var(--garden-petal-1)"
        />
        <circle cx={6.4} cy={-3.6} r={0.8} fill="var(--card)" />
        <g
          style={{
            ...centreStyle,
            transformOrigin: "center bottom",
            animation: "garden-flap 420ms ease-in-out infinite",
          }}
        >
          <path
            d="M-3 -2 Q 0 -11 5 -3 Z"
            fill="var(--garden-bird)"
            style={{ filter: "brightness(0.85)" }}
          />
        </g>
      </>
    );
  } else {
    body = (
      <>
        <g style={flap(260)}>
          <ellipse cx={-4.5} cy={-3} rx={4.8} ry={4} fill={wing} />
          <ellipse cx={4.5} cy={-3} rx={4.8} ry={4} fill={wing} />
          <ellipse cx={-3.5} cy={3} rx={3.2} ry={2.8} fill={wingDeep} />
          <ellipse cx={3.5} cy={3} rx={3.2} ry={2.8} fill={wingDeep} />
        </g>
        <path
          d="M0 -6 V 5"
          stroke="var(--garden-ink)"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
        {gold && (
          <g transform="translate(9 -8)">
            <g
              style={{
                ...centreStyle,
                animation: "garden-shimmer 1.8s ease-in-out infinite",
              }}
            >
              <Sparkle r={2.4} fill="var(--garden-gold)" />
            </g>
          </g>
        )}
      </>
    );
  }

  return (
    <g transform="translate(96 66)">
      <g
        style={
          arriving
            ? { animation: "garden-arrive 1600ms var(--ease-brand) 600ms both" }
            : undefined
        }
      >
        <g style={{ animation: "garden-wander 16s ease-in-out infinite" }}>
          {body}
        </g>
      </g>
    </g>
  );
}

function PetalShower({ epoch }: { epoch: number }) {
  return (
    <g key={epoch}>
      {Array.from({ length: 16 }, (_, k) => (
        <ellipse
          key={k}
          cx={10 + noise(k + epoch) * 300}
          cy={-6}
          rx={1.6}
          ry={2.8}
          className={`garden-tone-${(k % 4) + 1}`}
          fill={k % 5 === 0 ? "var(--garden-gold)" : PETAL}
          style={
            {
              ...centreStyle,
              "--dx": `${(noise(k + 9) - 0.5) * 60}px`,
              animation: `garden-petal-fall ${2200 + noise(k + 3) * 1600}ms ease-in ${400 + k * 110}ms both`,
            } as React.CSSProperties
          }
        />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// The garden
// ---------------------------------------------------------------------------

const snapshotKey = (groupId: string, viewerId: string) =>
  `cetele:garden:v2:${groupId}:${viewerId}`;

/**
 * Compares what this viewer saw last time with now, and reports what changed.
 * Runs after hydration and again on every live refresh (GroupLive re-renders
 * this with new props), so one mechanism covers "since you last looked" and
 * "while you're looking".
 */
function useGardenChanges(
  groupId: string,
  viewerId: string,
  now: GardenSnapshot,
) {
  const [diff, setDiff] = React.useState<GardenDiff>(NO_CHANGE);
  const [epoch, setEpoch] = React.useState(0);
  const [announce, setAnnounce] = React.useState(false);
  const json = JSON.stringify(now);

  React.useEffect(() => {
    const snap = JSON.parse(json) as GardenSnapshot;
    const key = snapshotKey(groupId, viewerId);
    let prev: GardenSnapshot | null = null;
    try {
      prev = parseSnapshot(localStorage.getItem(key));
    } catch {
      prev = null;
    }
    const d = diffSince(prev, snap);
    const save = () => {
      try {
        localStorage.setItem(key, json);
      } catch {
        /* private mode: no replay, nothing else lost */
      }
    };
    if (!(d.newlyTended.length || d.justClosed || d.stagedUp)) {
      save();
      return;
    }
    // Commit after the paint, so the fresh blooms animate from a bud. The
    // snapshot is saved only once the change has actually been SHOWN: saved
    // up front, an effect that runs twice (Strict Mode, a fast re-render)
    // would read its own write the second time and the replay would be lost.
    const id = window.setTimeout(() => {
      save();
      setDiff(d);
      setEpoch((e) => e + 1);
      setAnnounce(true);
      // Browsers refuse a vibration before the page has had a tap, and say
      // so in the console; a replay on arrival usually comes before one.
      const nav = navigator as Navigator & {
        userActivation?: { hasBeenActive: boolean };
      };
      if (nav.userActivation?.hasBeenActive) {
        if (d.justClosed || d.stagedUp) hapticCelebrate();
        else hapticTick();
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [groupId, viewerId, json]);

  // The announcement fades after a while; the garden itself keeps its state.
  React.useEffect(() => {
    if (!announce) return;
    const id = window.setTimeout(() => setAnnounce(false), 9000);
    return () => window.clearTimeout(id);
  }, [announce, epoch]);

  return { diff, epoch, announce };
}

export function GroupGarden({
  garden,
  members,
  groupId,
  day,
  viewerId,
  todayLeft,
  className,
}: {
  garden: Garden;
  /** One per member, with whether they've logged anything today. */
  members: GardenMember[];
  groupId: string;
  /** The circle's local date, seeding today's rare blooms and visitor. */
  day: string;
  viewerId: string;
  /** Counts still to go on today's collective goal. */
  todayLeft: number;
  className?: string;
}) {
  const { stage, vitality, todayPct, tendedToday, memberCount, closedToday } =
    garden;
  const skyId = `garden-sky-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const literal = members.length > 0 && members.length <= 12;
  const drawn = Math.max(1, Math.min(12, memberCount || 7));
  const blooms = bloomCount(tendedToday, memberCount, drawn);
  const bed = React.useMemo(
    () => arrangeBed(members, blooms, memberCount),
    [members, blooms, memberCount],
  );

  const now: GardenSnapshot = React.useMemo(
    () => ({
      day,
      tended: members
        .filter((m) => m.tended)
        .map((m) => m.userId)
        .sort(),
      closed: closedToday,
      stage,
    }),
    [day, members, closedToday, stage],
  );
  const { diff, epoch, announce } = useGardenChanges(groupId, viewerId, now);
  const fresh = new Set(diff.newlyTended);

  const [selected, setSelected] = React.useState<string | null>(null);
  const me = members.find((m) => m.isMe);
  const visitor = dailyVisitor(groupId, day);
  const progress = stageProgress(vitality);
  const sun = sunHeight(todayPct);

  // A small circle gets BIGGER plants, not the same tiny ones marooned in a
  // wide field: a 3-person bed drawn at 12-person scale is most of why v1
  // looked sparse. Capped so the tallest plant's flower still clears the top.
  const n = bed.length;
  const plantScale = n <= 3 ? 1.35 : n <= 5 ? 1.25 : n <= 8 ? 1.1 : 1;
  const plants = bed.map((plot, i) => {
    const step = n > 1 ? Math.min(264 / (n - 1), 44 * plantScale) : 0;
    const left = (320 - step * (n - 1)) / 2;
    const wobble = ((i * 37) % 10) / 10 - 0.45;
    const v = Math.max(0, Math.min(1, vitality + wobble * 0.28));
    const id = plot.member?.userId ?? `plot-${i}`;
    return { plot, i, x: Math.round(left + i * step), v, id };
  });
  const freshOrder = plants.filter(
    (p) => p.plot.member && fresh.has(p.plot.member.userId),
  );

  const sel = members.find((m) => m.userId === selected) ?? null;
  const rareToday = members.filter(
    (m) => m.tended && isRareBloom(groupId, day, m.userId),
  );
  const nameOf = (m: GardenMember) => (m.isMe ? "You" : m.name);

  // ---- The announcement line: the biggest thing that just happened. ----
  let event: React.ReactNode = null;
  if (diff.justClosed) {
    event = (
      <>
        The circle closed the day. {VISITOR_LABEL[visitor]} came to visit
        {visitor === "golden-butterfly" ? ", and it's a rare one." : "."}
        {diff.stagedUp && ` Your garden grew to ${GARDEN_STAGE_LABEL[stage]}.`}
      </>
    );
  } else if (diff.stagedUp) {
    event = <>Your garden grew. It&apos;s {GARDEN_STAGE_LABEL[stage]} now.</>;
  } else if (diff.newlyTended.length) {
    const names = members.filter((m) => fresh.has(m.userId)).map(nameOf);
    const all = names.length ? names : [`${diff.newlyTended.length}`];
    const rare = members.some(
      (m) => fresh.has(m.userId) && isRareBloom(groupId, day, m.userId),
    );
    event = (
      <>
        {joinNames(all)} {all.length === 1 && all[0] !== "You" ? "has" : "have"}{" "}
        tended the garden.
        {rare && " A gold bloom opened."}
      </>
    );
  }

  // ---- The status line: where today stands, framed toward the finish. ----
  let status: React.ReactNode;
  if (closedToday) {
    status = (
      <>
        <span className="text-primary">All rings closed today.</span> The sun is
        out
        {rareToday.length === 0
          ? "."
          : ` and ${rareToday.length === 1 ? "a gold bloom has" : `${rareToday.length} gold blooms have`} opened.`}
      </>
    );
  } else if (todayPct >= 0.75 && todayLeft > 0) {
    status = (
      <>
        <span className="text-primary">Nearly there.</span>{" "}
        <span className="tabular-nums">{todayLeft.toLocaleString()}</span> more
        to bring out the sun.
      </>
    );
  } else if (tendedToday > 0) {
    status = (
      <>
        <span className="text-primary tabular-nums">
          {tendedToday} of {memberCount}
        </span>{" "}
        {tendedToday === 1 ? "has" : "have"} tended it today. The sun is{" "}
        <span className="tabular-nums">{Math.round(todayPct * 100)}%</span> up.
      </>
    );
  } else {
    status = <>Nobody has tended it yet today. The first bloom is yours.</>;
  }

  return (
    <Card className={cn("flex flex-col overflow-hidden p-0", className)}>
      <svg
        viewBox="0 0 320 130"
        className="block aspect-[320/130] w-full grow"
        role="img"
        aria-label={`Group garden, ${GARDEN_STAGE_LABEL[stage]}. ${tendedToday} of ${memberCount} have tended it today.`}
        preserveAspectRatio="xMidYMax meet"
      >
        <defs>
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

        <rect x={0} y={-400} width={320} height={530} fill={`url(#${skyId})`} />
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
                animation: `garden-twinkle ${7 + (i % 4) * 2.5}s ease-in-out ${i * 0.8}s infinite`,
              }}
            />
          ))}
        </g>

        {sun > 0 && (
          <Sun height={sun} closed={closedToday} celebrate={diff.justClosed} />
        )}

        <path
          d="M0 94 Q 68 78 136 90 Q 206 102 258 86 Q 296 76 320 84 V130 H0 Z"
          className="garden-hill-far"
        />
        <path
          d="M0 100 Q 84 88 150 98 Q 214 108 272 94 Q 302 88 320 92 V130 H0 Z"
          className="garden-hill-near"
        />
        <path
          d="M0 110 Q 160 97 320 110 V130 H0 Z"
          fill="var(--garden-grass, var(--color-primary-200))"
        />
        <path
          d="M0 116 Q 160 106 320 116 V130 H0 Z"
          fill="var(--garden-grass-deep, var(--color-primary-200))"
        />
        <path
          d="M0 124 Q 160 118 320 124 V130 H0 Z"
          fill="var(--garden-soil, var(--color-primary-300))"
          opacity={0.55}
        />
        {TUFTS.map((t) => (
          <path
            key={t.x}
            d={`M${t.x} ${t.y} q -1 -${3 * t.s} -2.5 -${4.5 * t.s} M${t.x} ${t.y} q 0.4 -${4 * t.s} 0.2 -${6 * t.s} M${t.x} ${t.y} q 1 -${3 * t.s} 2.6 -${4.2 * t.s}`}
            stroke="var(--garden-tuft, var(--color-primary-400))"
            strokeWidth={0.9}
            strokeLinecap="round"
            fill="none"
          />
        ))}

        {plants.map(({ plot, i, x, v, id }) => {
          const m = plot.member;
          const isFresh = !!m && fresh.has(m.userId);
          const freshIdx = freshOrder.findIndex((f) => f.id === id);
          return (
            <g
              key={`${id}-${isFresh ? epoch : 0}`}
              transform={`translate(${x} ${GROUND}) scale(${plantScale}) translate(${-x} ${-GROUND})`}
            >
              <Plant
                x={x}
                i={i}
                v={v}
                stage={stage}
                blooming={plot.blooming}
                openness={todayPct}
                kind={
                  m
                    ? bloomKind(m.userId)
                    : (["daisy", "tulip", "star", "peony"] as const)[i % 4]
                }
                tone={
                  m ? petalTone(m.userId) : (((i % 4) + 1) as 1 | 2 | 3 | 4)
                }
                rare={
                  !!m && plot.blooming && isRareBloom(groupId, day, m.userId)
                }
                fresh={isFresh}
                freshDelay={500 + Math.max(0, freshIdx) * 420}
                isMe={!!m?.isMe}
                waiting={!!m?.isMe && !plot.blooming}
                selected={!!m && selected === m.userId}
                label={
                  m
                    ? `${m.isMe ? "Your" : `${m.name}'s`} plant, ${m.tended ? "in bloom today" : "a bud, not opened yet today"}`
                    : null
                }
                onSelect={
                  m
                    ? () =>
                        setSelected((s) => (s === m.userId ? null : m.userId))
                    : null
                }
                growKey={diff.stagedUp ? epoch : 0}
              />
            </g>
          );
        })}

        {closedToday && (
          <Visitor
            key={`v-${diff.justClosed ? epoch : 0}`}
            kind={visitor}
            arriving={diff.justClosed}
          />
        )}
        {diff.justClosed && <PetalShower epoch={epoch} />}
      </svg>

      <div className="px-4 pt-3 pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-foreground">
            Your circle&apos;s garden
          </h2>
          <span className="shrink-0 rounded-full bg-primary-container px-2.5 py-0.5 text-xs font-semibold text-on-primary-container">
            {GARDEN_STAGE_LABEL[stage]}
          </span>
        </div>

        {progress.next !== null ? (
          <div className="mt-2.5">
            <ProgressBar
              value={Math.round(progress.pct * 100)}
              role="img"
              aria-label={`${Math.round(progress.pct * 100)}% of the way to ${GARDEN_STAGE_LABEL[progress.next]}`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {Math.round(progress.pct * 100)}%
              </span>{" "}
              of the way to {GARDEN_STAGE_LABEL[progress.next]}.{" "}
              {GARDEN_STAGE_COPY[stage]}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-balance text-muted-foreground">
            {GARDEN_STAGE_COPY[stage]}
          </p>
        )}

        <p aria-live="polite" className="min-h-0">
          {announce && event && (
            <span className="rise-in mt-2.5 flex items-start gap-2 rounded-lg bg-accent-container px-3 py-2 text-sm font-medium text-on-accent-container">
              <svg
                viewBox="-6 -6 12 12"
                className="mt-0.5 size-4 shrink-0"
                aria-hidden
              >
                <Sparkle r={5.5} fill="var(--on-accent-container)" />
              </svg>
              <span>{event}</span>
            </span>
          )}
        </p>

        {memberCount > 0 && (
          <p className="mt-2 text-xs font-medium text-foreground/80">
            {status}
          </p>
        )}

        {sel && (
          <p className="rise-in mt-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {sel.isMe ? "Your" : `${sel.name}'s`}
            </span>{" "}
            {bloomKind(sel.userId)}{" "}
            {sel.tended
              ? isRareBloom(groupId, day, sel.userId)
                ? "opened gold today."
                : "is in bloom today."
              : "is a bud, waiting to open."}
          </p>
        )}

        {literal && me && !me.tended && memberCount > 0 && (
          <Link
            href={groupHref(groupId, "/today")}
            className={cn(
              buttonVariants({ variant: "tonal", size: "sm" }),
              "mt-3",
            )}
          >
            Tend your plant
          </Link>
        )}
      </div>
    </Card>
  );
}

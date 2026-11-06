/**
 * The garden's reward rules (CET-17, v2 — "the garden as a dopamine loop").
 *
 * `lib/retention.ts` decides WHAT the garden is (stage, vitality, who tended).
 * This module decides how the garden turns that into moments worth looking at,
 * and each rule maps to one piece of the research behind the redesign:
 *
 *   · stageProgress  — endowed progress / goal gradient (Nunes & Drèze 2006;
 *                      Kivetz et al. 2006): show how far into the next stage the
 *                      circle already is, so the durable layer has a visible
 *                      finish line instead of a label that turns over monthly.
 *   · sunHeight      — goal gradient for the DAY: the sun climbs with the
 *                      collective goal, accelerating near the top, so the last
 *                      few taps are the most visible ones.
 *   · bloomKind      — ownership: a member's flower is always the same shape,
 *                      so "my plant" is a thing you can recognise.
 *   · isRareBloom / dailyVisitor — variable reward (Schultz et al. 1997, the
 *                      reward-prediction-error result; PRD §"surprise
 *                      milestones"). Seeded, NOT random: everyone in the circle
 *                      sees the same rare bloom and the same visitor, so it is a
 *                      shared event to talk about, and a reload can't re-roll it.
 *   · diffSince      — prediction error needs a CHANGE to land on. Arriving to a
 *                      garden that is simply in its new state shows the outcome
 *                      and skips the reward; replaying what changed since you
 *                      last looked is the moment itself.
 *
 * Every rule here can only ADD (D49) and none of them names an absence (D8).
 * Self-contained on purpose (no imports), so `pnpm test:unit` runs it bare.
 */

// ---------------------------------------------------------------------------
// Durable layer — progress inside the current stage
// ---------------------------------------------------------------------------

/** Where each stage starts on the blended 0..100 scale (mirrors gardenStage). */
export const STAGE_FLOORS = [0, 20, 40, 65] as const;

/**
 * How far the circle is through its current stage, toward the next one.
 * `next` is null at the top stage, where there is no further finish line.
 */
export function stageProgress(vitality: number): {
  stage: number;
  next: number | null;
  pct: number;
} {
  const v = Math.max(0, Math.min(100, vitality * 100));
  let stage = 0;
  for (let i = STAGE_FLOORS.length - 1; i >= 0; i--) {
    if (v >= STAGE_FLOORS[i]) {
      stage = i;
      break;
    }
  }
  if (stage === STAGE_FLOORS.length - 1) {
    return {
      stage,
      next: null,
      pct: (v - STAGE_FLOORS[stage]) / (100 - STAGE_FLOORS[stage]),
    };
  }
  const lo = STAGE_FLOORS[stage];
  const hi = STAGE_FLOORS[stage + 1];
  return { stage, next: stage + 1, pct: (v - lo) / (hi - lo) };
}

// ---------------------------------------------------------------------------
// Today layer — the sun
// ---------------------------------------------------------------------------

/**
 * 0..1 height of the sun above the hills for today's collective progress.
 * Eased so the climb SPEEDS UP near the goal (the goal-gradient shape): the
 * first taps lift it a little, the last few lift it a lot. Any progress at all
 * gets it peeking over the hill — the first count must visibly do something.
 */
export function sunHeight(todayPct: number): number {
  const t = Math.max(0, Math.min(1, todayPct));
  if (t === 0) return 0;
  if (t >= 1) return 1;
  const peek = 0.12;
  return peek + (1 - peek) * t * t * (0.6 + 0.4 * t);
}

// ---------------------------------------------------------------------------
// Seeded variety
// ---------------------------------------------------------------------------

/** FNV-1a, 32-bit. Stable across runtimes, which is the only property needed. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const BLOOM_KINDS = ["daisy", "tulip", "star", "peony"] as const;
export type BloomKind = (typeof BLOOM_KINDS)[number];

/** A member's flower shape: theirs, permanently, so their plant is recognisable. */
export function bloomKind(userId: string): BloomKind {
  return BLOOM_KINDS[hash32(`kind:${userId}`) % BLOOM_KINDS.length];
}

/** A member's petal colour slot (1..4), also permanent. */
export function petalTone(userId: string): 1 | 2 | 3 | 4 {
  return ((hash32(`tone:${userId}`) % 4) + 1) as 1 | 2 | 3 | 4;
}

/** Roughly 1 in 9 tended plants opens gold on a given day. */
export const RARE_BLOOM_ODDS = 9;

/**
 * Whether this member's bloom opens GOLD today. Only ever asked about a member
 * who tended — a rare bloom decorates a real contribution, it is never a prize
 * in itself, and a member who didn't tend has nothing to be rare.
 */
export function isRareBloom(
  groupId: string,
  day: string,
  userId: string,
): boolean {
  return hash32(`rare:${groupId}:${day}:${userId}`) % RARE_BLOOM_ODDS === 0;
}

export type VisitorKind = "butterfly" | "bee" | "bird" | "golden-butterfly";

/**
 * Who visits when the circle closes the day. Common to rare, ~55/25/15/5.
 * Seeded by circle + day so every member sees the same visitor.
 */
export function dailyVisitor(groupId: string, day: string): VisitorKind {
  const roll = hash32(`visitor:${groupId}:${day}`) % 100;
  if (roll < 55) return "butterfly";
  if (roll < 80) return "bee";
  if (roll < 95) return "bird";
  return "golden-butterfly";
}

export const VISITOR_LABEL: Record<VisitorKind, string> = {
  butterfly: "A butterfly",
  bee: "A bee",
  bird: "A songbird",
  "golden-butterfly": "A golden butterfly",
};

// ---------------------------------------------------------------------------
// The bed — which plot belongs to whom
// ---------------------------------------------------------------------------

export type GardenMember = {
  userId: string;
  name: string;
  isMe: boolean;
  tended: boolean;
};

export type Plot = {
  /** The member this plant IS, or null once the circle is too big to be literal. */
  member: GardenMember | null;
  blooming: boolean;
};

/** One plant per member up to this many; past it the bed is proportional. */
export const MAX_LITERAL_PLOTS = 12;

/**
 * Lays out the bed. Plots are ordered by userId, NOT by name or activity, so a
 * member's plant stands in the same place every day — the spot is theirs.
 * Ordering by activity would shuffle the bed each time someone tended, and the
 * one thing a plot must never do is move.
 *
 * Past MAX_LITERAL_PLOTS the plants stop being people: `blooms` of them open,
 * spread evenly, and the caption carries the real numbers.
 */
export function arrangeBed(
  members: GardenMember[],
  blooms: number,
  fallbackCount: number,
): Plot[] {
  if (members.length > 0 && members.length <= MAX_LITERAL_PLOTS) {
    return [...members]
      .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
      .map((m) => ({ member: m, blooming: m.tended }));
  }
  const drawn = Math.max(
    1,
    Math.min(MAX_LITERAL_PLOTS, members.length || fallbackCount || 7),
  );
  return Array.from({ length: drawn }, (_, i) => ({
    member: null,
    // The even-distribution step: exactly `blooms` plots open, spread through
    // the bed rather than packed at one end.
    blooming:
      Math.floor(((i + 1) * blooms) / drawn) > Math.floor((i * blooms) / drawn),
  }));
}

// ---------------------------------------------------------------------------
// What changed since you last looked
// ---------------------------------------------------------------------------

export type GardenSnapshot = {
  day: string;
  tended: string[];
  closed: boolean;
  stage: number;
};

export type GardenDiff = {
  /** Members whose bloom opened since the snapshot (today only). */
  newlyTended: string[];
  /** The circle closed the day since the snapshot. */
  justClosed: boolean;
  /** The garden moved up a stage since the snapshot. */
  stagedUp: boolean;
};

export const NO_CHANGE: GardenDiff = {
  newlyTended: [],
  justClosed: false,
  stagedUp: false,
};

/**
 * The changes worth replaying. With no snapshot (a first visit) nothing is
 * replayed: there is no "before" to change from, and inventing one would
 * celebrate the same bloom again on every new device.
 *
 * A snapshot from an EARLIER day means today's layer started fresh since then,
 * so everything tended today is new to this viewer. Stage is durable, so it is
 * compared across days.
 *
 * Changes only count upward. A bloom that has gone (a log deleted) or a stage
 * that dropped is not replayed — nothing in the garden animates a loss (D49).
 */
export function diffSince(
  prev: GardenSnapshot | null,
  now: GardenSnapshot,
): GardenDiff {
  if (!prev) return NO_CHANGE;
  const sameDay = prev.day === now.day;
  const before = new Set(sameDay ? prev.tended : []);
  return {
    newlyTended: now.tended.filter((id) => !before.has(id)),
    justClosed: now.closed && !(sameDay && prev.closed),
    stagedUp: now.stage > prev.stage,
  };
}

/** Parses a stored snapshot defensively; anything malformed reads as none. */
export function parseSnapshot(raw: string | null): GardenSnapshot | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<GardenSnapshot>;
    if (
      typeof v.day !== "string" ||
      !Array.isArray(v.tended) ||
      typeof v.closed !== "boolean" ||
      typeof v.stage !== "number"
    ) {
      return null;
    }
    return {
      day: v.day,
      tended: v.tended.filter((x): x is string => typeof x === "string"),
      closed: v.closed,
      stage: v.stage,
    };
  } catch {
    return null;
  }
}

/** "Yusuf", "Yusuf and Zayd", "Yusuf, Zayd and Ahmad", "Yusuf, Zayd and 3 others". */
export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= 3) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

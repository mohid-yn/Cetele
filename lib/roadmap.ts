/**
 * Roadmap — the administration's development programme: work done OUTSIDE the
 * app (books, khatms, memorisation, lectures), organised into LEVELS a member
 * walks in order, with a reward at the end of each.
 *
 * This is deliberately NOT the daily-task engine, and the two must not touch:
 *
 *   - `logs` is pruned at 14 days (D31a) and back-dating is capped at 13 days
 *     (D36a), so a year-long programme cannot record its progress there at all.
 *   - A roadmap item must never reach `private.obligations`. If "read the book"
 *     counted toward day-completion, a day spent not reading would break a
 *     streak — a punishment mechanic, straight into D8. Roadmap progress only
 *     ever ADDS; it can never take a day, a streak or a plant away.
 *
 * LEVELS ARE SEQUENTIAL, NOT A CHOICE. Read off the booklet's memorisation
 * tables: level 1 is surahs 93–114, level 2 is 86–92, level 3 is 78–85 —
 * contiguous, non-overlapping, running backwards through the mushaf, and
 * together exactly Juz 'Amma. Level 2 continues where level 1 stopped; it does
 * not contain it. So a level is a STAGE, and a member's level is DERIVED (the
 * lowest they have not finished) rather than stored, assigned or chosen.
 * Everyone starts at level 1 and logs their way up.
 *
 * EVERYTHING BELOW MIRRORS SQL, AND THE SQL IS THE AUTHORITY.
 * `private.category_complete` / `private.level_complete` / `levels_complete` in
 * migration 0025 decide what is actually finished; this file exists so the
 * screen can render without a round trip per item. Same arrangement as
 * `lib/assignments.ts` against `task_due_on` — and the same warning that file
 * earned the hard way: a mirror agreeing with its original proves nothing when
 * both are wrong. The mirror is checked against the SQL in pgTAP 014.
 */

/** The booklet's five kinds of work. Drives grouping, icon and heading. */
export type RoadmapCategory =
  | "book"
  | "quran"
  | "quran_studies"
  | "memorisation"
  | "listening";

export type RoadmapItem = {
  id: string;
  /** Which stage this belongs to. Sequential, 1-based. */
  level: number;
  category: RoadmapCategory;
  title: string;
  /** Who it is by, or where it is from — an author, a surah range. */
  source: string | null;
  /** Where the member goes to do it. Null is ordinary: a book has no URL, and
   *  a lecture whose real link is unknown must show nothing, never a guess. */
  url: string | null;
  /** What one unit is, in the plural: "minutes", "juz", "surahs". */
  unit: string;
  /** How many units finish the item. */
  target: number;
  /** Must be finished whatever the budget total says (booklet: "Compulsory"). */
  compulsory: boolean;
  /** How many units the member has recorded so far. */
  done: number;
};

/**
 * A category finished by reaching a TOTAL rather than by finishing every item —
 * the booklet's "listen to a total of 600 minutes" from a menu. Keyed by level
 * and category; a category with no requirement needs all of its items.
 */
export type LevelRequirement = {
  level: number;
  category: RoadmapCategory;
  minTotal: number;
};

export type RoadmapReward = {
  id: string;
  /** How many LEVELS must be complete before this unlocks — not items. */
  threshold: number;
  label: string;
  description: string | null;
};

export type Roadmap = {
  id: string;
  name: string;
  /** Plain calendar dates — a programme's window is not a timestamp. */
  startsOn: string;
  endsOn: string;
  items: RoadmapItem[];
  requirements: LevelRequirement[];
  /** Ascending by threshold. `nextReward` relies on that order. */
  rewards: RoadmapReward[];
};

/** Headings, and the order categories are shown in. Mirrors the booklet. */
export const CATEGORY_ORDER: RoadmapCategory[] = [
  "book",
  "quran",
  "quran_studies",
  "memorisation",
  "listening",
];

export const CATEGORY_LABEL: Record<RoadmapCategory, string> = {
  book: "Book",
  quran: "Qur'an",
  quran_studies: "Qur'an studies",
  memorisation: "Memorisation",
  listening: "Listening & watching",
};

/** An item cannot contribute more than it is worth. */
export const cappedDone = (i: RoadmapItem) => Math.min(i.done, i.target);

export const isItemComplete = (i: RoadmapItem) => i.done >= i.target;

/** Every distinct level in the programme, ascending. */
export function levelsOf(items: RoadmapItem[]): number[] {
  return [...new Set(items.map((i) => i.level))].sort((a, b) => a - b);
}

export const itemsAt = (items: RoadmapItem[], level: number) =>
  items.filter((i) => i.level === level);

export const itemsIn = (
  items: RoadmapItem[],
  level: number,
  category: RoadmapCategory,
) => items.filter((i) => i.level === level && i.category === category);

/** The categories actually present at a level, in the booklet's order. */
export function categoriesAt(
  items: RoadmapItem[],
  level: number,
): RoadmapCategory[] {
  const present = new Set(itemsAt(items, level).map((i) => i.category));
  return CATEGORY_ORDER.filter((c) => present.has(c));
}

export const requirementFor = (
  reqs: LevelRequirement[],
  level: number,
  category: RoadmapCategory,
) => reqs.find((r) => r.level === level && r.category === category) ?? null;

/**
 * Mirrors `private.category_complete`.
 *
 * A category with a requirement is a BUDGET: the sum of capped progress must
 * reach `minTotal`, AND every compulsory item must be finished outright —
 * reaching 600 minutes without the two compulsory lectures is not finishing it.
 * Without a requirement, every item must be finished.
 */
export function categoryComplete(
  items: RoadmapItem[],
  reqs: LevelRequirement[],
  level: number,
  category: RoadmapCategory,
): boolean {
  const group = itemsIn(items, level, category);
  if (group.length === 0) return false;

  const req = requirementFor(reqs, level, category);
  if (!req) return group.every(isItemComplete);

  const total = group.reduce((n, i) => n + cappedDone(i), 0);
  return (
    total >= req.minTotal &&
    group.every((i) => !i.compulsory || isItemComplete(i))
  );
}

/**
 * Mirrors `private.level_complete`. A level with no items is NOT complete —
 * otherwise a half-authored programme would hand out every reward.
 */
export function levelComplete(
  items: RoadmapItem[],
  reqs: LevelRequirement[],
  level: number,
): boolean {
  const cats = categoriesAt(items, level);
  if (cats.length === 0) return false;
  return cats.every((c) => categoryComplete(items, reqs, level, c));
}

/**
 * Mirrors `private.levels_complete` — levels finished from the BOTTOM UP, which
 * is the unit rewards are earned in. Stops at the first gap, so finishing
 * level 3 while level 2 is unfinished counts as one level, not two.
 */
export function levelsComplete(
  items: RoadmapItem[],
  reqs: LevelRequirement[],
): number {
  const levels = levelsOf(items);
  let n = 0;
  for (const l of levels) {
    if (!levelComplete(items, reqs, l)) break;
    n += 1;
  }
  return n;
}

/**
 * The level the member is working on: the lowest they have not finished. Null
 * once the whole programme is done — the caller renders a finished state rather
 * than pointing at a level that does not exist.
 */
export function currentLevel(
  items: RoadmapItem[],
  reqs: LevelRequirement[],
): number | null {
  return levelsOf(items).find((l) => !levelComplete(items, reqs, l)) ?? null;
}

/**
 * How far through a category, as a fraction — for the bar under its heading.
 * Budgeted categories measure against the BUDGET, not the sum of every item on
 * the menu: at level 1 there are 1,228 minutes available against a 600-minute
 * requirement, so scoring against the menu would show a member at 49% when they
 * had in fact finished.
 */
export function categoryPct(
  items: RoadmapItem[],
  reqs: LevelRequirement[],
  level: number,
  category: RoadmapCategory,
): number {
  const group = itemsIn(items, level, category);
  if (!group.length) return 0;

  const req = requirementFor(reqs, level, category);
  const done = group.reduce((n, i) => n + cappedDone(i), 0);
  const target = req ? req.minTotal : group.reduce((n, i) => n + i.target, 0);
  if (!target) return 0;
  return Math.min(100, Math.round((done / target) * 100));
}

/** Overall progress through ONE level, averaged over its categories evenly. */
export function levelPct(
  items: RoadmapItem[],
  reqs: LevelRequirement[],
  level: number,
): number {
  const cats = categoriesAt(items, level);
  if (!cats.length) return 0;
  const sum = cats.reduce((n, c) => n + categoryPct(items, reqs, level, c), 0);
  return Math.round(sum / cats.length);
}

/** The next reward still to unlock, or null once every one is earned. */
export function nextReward(
  rewards: RoadmapReward[],
  levelsDone: number,
): RoadmapReward | null {
  return rewards.find((r) => levelsDone < r.threshold) ?? null;
}

/**
 * Days remaining in the window, counted on the MEMBER's calendar — `todayISO`
 * is theirs (D34), never the server's. Both bounds are plain dates, so they
 * parse at UTC midnight and the subtraction is a pure day count with no zone in
 * it. Never negative: a finished programme reads "0 days left", not "-6".
 */
export function daysLeft(endsOn: string, todayISO: string): number {
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  const today = Date.parse(`${todayISO}T00:00:00Z`);
  if (Number.isNaN(end) || Number.isNaN(today)) return 0;
  return Math.max(0, Math.round((end - today) / 86_400_000));
}

/** Whether the window is open on the member's own calendar. */
export const isActiveOn = (roadmap: Roadmap, todayISO: string) =>
  todayISO >= roadmap.startsOn && todayISO <= roadmap.endsOn;

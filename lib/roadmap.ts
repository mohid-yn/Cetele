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
 * both are wrong.
 *
 * WHAT IS CHECKED, AND WHAT IS NOT. `roadmap.test.ts` runs the completion rules
 * here against the SAME cases pgTAP 014 asserts against the SQL, case for case,
 * so the two are pinned to one oracle. That is the part with a twin.
 *
 * THE PERCENTAGES HAVE NO TWIN. `categoryPct` / `levelPct` exist only here — the
 * database never computes a fraction — so no cross-check can catch them, and the
 * unit tests are the only thing standing behind them. That is not incidental: a
 * budget met with a compulsory item outstanding rendered a 100% bar over an
 * incomplete category for exactly as long as nobody looked, because there was
 * nothing on either side of the mirror to disagree with it. Anything added here
 * that the SQL does not also compute needs its test written first.
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
 *
 * A category with NO items is not complete, for the reason an empty LEVEL is
 * not: vacuous completion in a half-authored programme hands out rewards. The
 * SQL originally disagreed here — `not exists (… where done < target)` over an
 * empty set is TRUE — and neither caller could reach it, because both enumerate
 * only the categories that have items. It is fixed in the SQL rather than
 * papered over here: a latent disagreement in this pair is exactly what the
 * header warns about, and "unreachable today" is not a property either side
 * enforces.
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
 * 100% MEANS COMPLETE, and nothing else may round up into it.
 *
 * A percentage is the loudest thing on the screen, so it must not be able to
 * contradict the rule beside it. Two ways it could, both real:
 *
 *   * a BUDGET is met while a compulsory item is untouched — on the real level-1
 *     content the optional lectures total 943 minutes against a 600-minute
 *     budget, so a member can reach 689 of 600 with neither required lecture
 *     watched. The bar read 100%, the heading read "689 of 600 minutes", and the
 *     category was not complete;
 *   * plain ROUNDING — 249 of 250 units is 99.6%, which `Math.round` takes to
 *     100 with an item still unfinished.
 *
 * So a fraction that lands on 100 is held at 99 unless the thing it measures is
 * actually finished. 99 is honest and it is legible: "so close", which is what
 * the member needs to see when two lectures are outstanding.
 */
const capBelowComplete = (pct: number, complete: boolean) =>
  pct >= 100 && !complete ? 99 : pct;

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

  return capBelowComplete(
    Math.min(100, Math.round((done / target) * 100)),
    categoryComplete(items, reqs, level, category),
  );
}

/**
 * Overall progress through ONE level, averaged over its categories evenly.
 *
 * Capped for the same reason its parts are, and it needs its own cap rather
 * than inheriting theirs: an average of 100 and 99 is 99.5, which rounds back up
 * to 100 across a level that is not finished.
 */
export function levelPct(
  items: RoadmapItem[],
  reqs: LevelRequirement[],
  level: number,
): number {
  const cats = categoriesAt(items, level);
  if (!cats.length) return 0;
  const sum = cats.reduce((n, c) => n + categoryPct(items, reqs, level, c), 0);
  return capBelowComplete(
    Math.round(sum / cats.length),
    levelComplete(items, reqs, level),
  );
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

/**
 * Where the member stands in the programme's window, on THEIR calendar (D34).
 *
 * This exists because "0 days left" is not the truth about a closed programme —
 * it is the truth about the last day of an open one, and the two read
 * identically forever after `ends_on` passes. A year-long thing that says "0
 * days left" every day for the following decade is worse than saying nothing.
 *
 * `days` is the distance to the boundary that matters: to the end while it is
 * running, to the START while it is still upcoming (a programme staged early is
 * visible before it opens, which is the whole point of `published`).
 *
 * Whether writes should CLOSE with the window is a separate, open question
 * (STATUS Q5). Nothing here refuses anything; it reports.
 */
export type ProgrammeWindow = {
  state: "upcoming" | "open" | "closed";
  days: number;
};

export function programmeWindow(
  startsOn: string,
  endsOn: string,
  todayISO: string,
): ProgrammeWindow {
  if (todayISO < startsOn)
    return { state: "upcoming", days: daysLeft(startsOn, todayISO) };
  if (todayISO > endsOn) return { state: "closed", days: 0 };
  return { state: "open", days: daysLeft(endsOn, todayISO) };
}

/** Whether the window is open on the member's own calendar. */
export const isActiveOn = (roadmap: Roadmap, todayISO: string) =>
  programmeWindow(roadmap.startsOn, roadmap.endsOn, todayISO).state === "open";

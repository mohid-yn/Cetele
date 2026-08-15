/**
 * "Is circle A's task the same act as circle B's?" — the SUGGESTING half of D64.
 *
 * A link is the MEMBER's claim that two tasks are one act, and migration 0034
 * holds everything that follows from it: the cluster, the fan-out, the
 * same-circle refusal, the dormancy rule. This module does none of that. It only
 * decides which pairs are worth OFFERING, so a member who carries salawat in
 * three circles is shown the three pairs rather than hunting for them.
 *
 * NOTHING HERE EVER LINKS ANYTHING. Every function below returns a suggestion.
 * A link exists only after the member presses Link and `public.link_tasks` says
 * so — which is why a false positive is cheap (an offer declined) and why the
 * thresholds are tuned to be generous rather than exact.
 *
 * NO DATABASE TWIN, so `lib/task-links.test.ts` is the entire coverage of every
 * rule written here — `lib/rings.ts`' standing, and the opposite of
 * `lib/shares.ts`, which is pinned case-for-case against pgTAP 018.
 */

/** Dice coefficient a pair must reach to be offered at all. */
export const SUGGEST_THRESHOLD = 0.6;

/**
 * Below this many characters a token must match EXACTLY.
 *
 * Not a nicety: "car" and "bar" are one edit apart over three characters, which
 * is a ratio of 0.67 and would sail past any fuzzy threshold loose enough to
 * catch a real typo. Short words are where edit distance stops meaning
 * similarity — every three-letter word is close to every other one.
 */
export const MIN_FUZZY_TOKEN = 4;

/** How alike two long tokens must be: 1 − distance/length. "salawaat"/"salawat"
 *  is 0.875 and matches; "istighfar"/"astaghfar" is 0.67 and does not. */
export const FUZZY_RATIO = 0.8;

/** A ceiling on the offer list, not on how many links a member may have. Ten
 *  pairs is already more than anyone will read; the cluster cap (10 tasks) is
 *  the real limit and it lives in the RPC. */
export const MAX_SUGGESTIONS = 10;

/** One of the member's tasks, as the links screen knows it. */
export type LinkableTask = {
  taskId: string;
  label: string;
  groupId: string;
  groupName: string;
};

/** A pair worth offering, with the score that got it there. */
export type Suggestion = {
  a: LinkableTask;
  b: LinkableTask;
  /** 0–1. Rendered nowhere — it exists to order the list. */
  score: number;
};

/**
 * A trailing count, stripped before anything is compared.
 *
 * "Salawat ×100" and "Salawat 500" are the same act asked for in different
 * amounts — which is precisely the case D64 exists for, because the raw count
 * travels and the completion does not. Leaving the number in would make the two
 * circles' wildly different targets the reason the pair is never offered.
 *
 * THE COST, stated rather than hidden: a bare trailing number is read as a
 * count, so "Surah 36" and "Surah 18" reduce to the same thing and WILL be
 * offered as a pair. That is a suggestion the member declines, against a pattern
 * ("Istighfar 100") that is how tasks in this app are actually named.
 *
 * The lookbehind is what keeps the "x" form from eating a word: without it,
 * "Max 100" matches at the x of "Max" and reduces to "ma". A count is only ever
 * a count when nothing alphanumeric runs straight into it.
 */
const TRAILING_COUNT =
  /(?<![\p{L}\p{N}])(?:[x×*]\s*\d+|\d+\s*[x×*]?|\(\s*\d+\s*\)|[-–—]\s*\d+)$/u;

/**
 * A label reduced to what it is ABOUT: case-folded, unaccented, countless,
 * unpunctuated.
 *
 * The mark-stripping is Unicode-wide on purpose. It does the obvious thing for
 * Latin ("Salât" → "salat"), and the same thing for Arabic, where the harakat
 * are combining marks in their own right: a member who typed ٱلْحَمْدُ in one circle and
 * الحمد in another wrote the same word, and only one of them reached for the
 * vowel marks.
 */
export function normaliseLabel(label: string): string {
  let s = label
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim();

  // Repeated, because a label can carry more than one ("Salawat (100) ×3") and
  // one pass would leave the inner one standing.
  let previous: string;
  do {
    previous = s;
    s = s.replace(TRAILING_COUNT, "").trim();
  } while (s !== previous && s !== "");

  // Everything that is not a letter or a digit becomes a gap. Punctuation is
  // never the difference between two names for one act.
  return s.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The words of a label, in order, after `normaliseLabel`. */
export function tokenise(label: string): string[] {
  const n = normaliseLabel(label);
  return n ? n.split(/\s+/) : [];
}

/** Levenshtein distance, two rows rather than a full matrix — these are task
 *  labels, so the inputs are short and the allocation is the only cost worth
 *  avoiding. */
function editDistance(x: string, y: string): number {
  if (x === y) return 0;
  if (!x.length) return y.length;
  if (!y.length) return x.length;

  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  let row = new Array<number>(y.length + 1);

  for (let i = 1; i <= x.length; i++) {
    row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, row] = [row, prev];
  }
  return prev[y.length];
}

/** Are these two words the same word? Exact always; near-enough only once both
 *  are long enough for "near" to mean anything (`MIN_FUZZY_TOKEN`). */
export function tokensMatch(x: string, y: string): boolean {
  if (x === y) return true;
  if (x.length < MIN_FUZZY_TOKEN || y.length < MIN_FUZZY_TOKEN) return false;
  const ratio = 1 - editDistance(x, y) / Math.max(x.length, y.length);
  return ratio >= FUZZY_RATIO;
}

/**
 * How alike two token lists are, 0–1 — Dice: twice the overlap over the total
 * length.
 *
 * Dice rather than "how much of the shorter one is covered", which scores
 * "Morning dhikr" against "dhikr" at a perfect 1.0 and would offer every task
 * whose name contains a common word. And rather than plain intersection over
 * union, which is stingier than it needs to be for a list nobody is obliged to
 * act on. The middle answer: "Morning Salawat"/"Salawat" scores 0.67 and is
 * offered; "Morning dhikr"/"Evening dhikr" scores 0.5 and is not, which is
 * right — those are two different sittings.
 *
 * Matching is ONE-TO-ONE and exact-first: a repeated word cannot be matched
 * twice, and a fuzzy near-match cannot consume a token that some later token
 * matches exactly.
 */
export function tokenSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;

  const pool = [...b];
  const unmatched: string[] = [];
  let overlap = 0;

  for (const token of a) {
    const exact = pool.indexOf(token);
    if (exact >= 0) {
      pool.splice(exact, 1);
      overlap += 1;
    } else {
      unmatched.push(token);
    }
  }
  for (const token of unmatched) {
    const near = pool.findIndex((other) => tokensMatch(token, other));
    if (near >= 0) {
      pool.splice(near, 1);
      overlap += 1;
    }
  }

  return (2 * overlap) / (a.length + b.length);
}

/** The same, from raw labels. */
export function labelSimilarity(a: string, b: string): number {
  return tokenSimilarity(tokenise(a), tokenise(b));
}

/**
 * The pairs worth offering, best first.
 *
 * CROSS-CIRCLE ONLY, which is the RPC's rule reproduced here so the member never
 * meets a button that exists to be refused: two tasks in one circle sharing a
 * fan-out would count a single act twice inside that circle's own collective
 * total. `link_tasks` still refuses it — this is the offer, not the authority.
 *
 * Pairs already in the same cluster are dropped, because they are already one
 * act; a pair spanning two DIFFERENT clusters is still offered, since linking
 * them is the merge that makes clusters worth having.
 *
 * @param tasks             the member's live tasks, across every circle
 * @param clusterByTask     taskId → the cluster it is already in, if any
 * @param limit             how many offers to return
 */
export function suggestLinks(
  tasks: LinkableTask[],
  clusterByTask: Record<string, string> = {},
  limit: number = MAX_SUGGESTIONS,
): Suggestion[] {
  const out: Suggestion[] = [];

  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i];
      const b = tasks[j];
      if (a.groupId === b.groupId) continue;

      const clusterA = clusterByTask[a.taskId];
      const clusterB = clusterByTask[b.taskId];
      if (clusterA && clusterA === clusterB) continue; // already one act

      const score = labelSimilarity(a.label, b.label);
      if (score >= SUGGEST_THRESHOLD) out.push({ a, b, score });
    }
  }

  // Score first, then the labels — a stable order matters more than it looks:
  // this list is re-rendered on every save, and offers that reshuffle under a
  // member who is halfway down them is the same complaint D63 makes about a
  // roster that reorders between visits.
  out.sort(
    (x, y) =>
      y.score - x.score ||
      x.a.label.localeCompare(y.a.label) ||
      x.b.label.localeCompare(y.b.label),
  );
  return out.slice(0, limit);
}

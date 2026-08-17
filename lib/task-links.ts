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

/** Dice coefficient a pair must reach to be called a likely match. */
export const SUGGEST_THRESHOLD = 0.6;

/**
 * How many tasks one act can cover — a MIRROR of `link_tasks`' cap (0034).
 *
 * The migration is the authority and refuses the eleventh regardless; this only
 * decides when the screen stops OFFERING, so the member meets the ceiling as a
 * sentence rather than as a failed button.
 */
export const MAX_CLUSTER_SIZE = 10;

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

/** One of the member's tasks, as the goals dialog knows it. */
export type LinkableTask = {
  taskId: string;
  label: string;
  groupId: string;
  groupName: string;
};

/**
 * A task already in this one's cluster.
 *
 * `label`/`groupName` are NULL when the member has LEFT that circle:
 * `tasks_select_member` will not show them a task there, so the name is
 * something the screen genuinely does not know rather than something it is
 * withholding. That is the visible face of 0019's dormancy rule — the row
 * survives, the fan-out ignores it, and the member keeps a control to clear it.
 */
export type LinkedSibling = {
  taskId: string;
  label: string | null;
  groupName: string | null;
  dormant: boolean;
};

/**
 * How many circles this act ACTUALLY counts in — the ones a tap still reaches.
 *
 * A dormant sibling is a link into a circle the member has left. The row
 * survives (0019's rule, D64's third application) and the fan-out gates on live
 * membership at write time, so nothing is written there — which makes "counts
 * in 3 circles" a claim the app does not honour the moment one of them is
 * dormant. Counting the live ones is the same arithmetic the fan-out does.
 *
 * NOT the same number as `clusterSize`, and the difference is the whole point:
 * one is what the member is told, the other is what the migration's cap counts.
 */
export function liveCircleCount(links: readonly LinkedSibling[]): number {
  return 1 + links.filter((l) => !l.dormant).length;
}

/**
 * How many tasks are in this one's cluster — a MIRROR of what `link_tasks`
 * counts when it checks `MAX_CLUSTER_SIZE`.
 *
 * DORMANT ROWS OCCUPY A SLOT. The migration's `count(*)` over the cluster does
 * not know or care whether the member still belongs to those circles, so a
 * screen that stopped offering on the live count alone would go on offering an
 * eleventh the RPC refuses.
 */
export function clusterSize(links: readonly LinkedSibling[]): number {
  return 1 + links.length;
}

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

/** A cross-circle task this one COULD be linked to, and how alike the names are. */
export type RankedCandidate = {
  task: LinkableTask;
  /** Label similarity, 0–1. */
  score: number;
  /** At or above `SUGGEST_THRESHOLD` — worth calling out as a likely match. */
  suggested: boolean;
};

/**
 * EVERY task this one could be linked to, best first.
 *
 * The list, not the pick. D66 shipped `suggestFor` alone, which made the single
 * fuzzy match the ONLY way to link anything: two circles that call one act
 * "Salawat" and "Durood Shareef" score 0, so the member had no path to a link
 * the RPC would happily have accepted, and a member whose labels never matched
 * never learned the feature existed. Ranking is now advice about ORDER; it
 * decides nothing about what is possible.
 *
 * CROSS-CIRCLE ONLY, which is `link_tasks`' rule reproduced here so the member
 * never meets a button that exists to be refused: two tasks in one circle
 * sharing a fan-out would count a single act twice inside that circle's own
 * collective total. The RPC remains the authority — this is only the offer.
 *
 * Already-linked tasks are dropped (they are the same act already). A candidate
 * in a DIFFERENT cluster stays: linking them is the merge that makes clusters
 * worth having.
 *
 * TOTALLY ORDERED, down to the task id. A list that reshuffles between renders
 * moves a button under the thumb reaching for it, and `score` alone leaves real
 * ties — two circles can hold identically named tasks.
 *
 * @param task           the task being linked FROM
 * @param candidates     the member's live tasks in every OTHER circle
 * @param linkedTaskIds  tasks already in this one's cluster
 */
export function rankCandidates(
  task: LinkableTask,
  candidates: LinkableTask[],
  linkedTaskIds: readonly string[] = [],
): RankedCandidate[] {
  const already = new Set(linkedTaskIds);
  const normalised = normaliseLabel(task.label);

  return candidates
    .filter(
      (c) =>
        c.taskId !== task.taskId &&
        c.groupId !== task.groupId &&
        !already.has(c.taskId),
    )
    .map((c) => {
      const score = labelSimilarity(task.label, c.label);
      return {
        task: c,
        score,
        suggested: score >= SUGGEST_THRESHOLD,
        // AN EXACT NAME BEATS A NEAR ONE, and it needs saying separately
        // because the score cannot express it: `tokenSimilarity` counts a fuzzy
        // token match as a whole match, so "Salawaat" and "Salawat ×100" both
        // score a perfect 1.0 against "Salawat". Guarded on a non-empty
        // reduction so two labels that are nothing but a count ("100", "×3")
        // are not declared the same act.
        exact: normalised !== "" && normaliseLabel(c.label) === normalised,
      };
    })
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        b.score - a.score ||
        a.task.label.localeCompare(b.task.label) ||
        a.task.taskId.localeCompare(b.task.taskId),
    )
    .map(({ task: t, score, suggested }) => ({ task: t, score, suggested }));
}

/**
 * The ONE task worth OFFERING unprompted, or null — the hint on the task's row
 * in "My goals" (D66), before the member has opened the link screen.
 *
 * Strictly the head of `rankCandidates`, and only when it clears the threshold:
 * an unprompted offer has to be good enough that pressing it is usually right,
 * whereas the full list is something the member went looking for. Two rankings
 * that could disagree about "best" would put a different circle behind the hint
 * than at the top of the list it opens.
 *
 * @param clusterByTask  taskId → the cluster it is already in, if any
 */
export function suggestFor(
  task: LinkableTask,
  candidates: LinkableTask[],
  clusterByTask: Record<string, string> = {},
): LinkableTask | null {
  const own = clusterByTask[task.taskId];
  const linked = own
    ? candidates
        .filter((c) => clusterByTask[c.taskId] === own)
        .map((c) => c.taskId)
    : [];

  const best = rankCandidates(task, candidates, linked)[0];
  return best && best.suggested ? best.task : null;
}

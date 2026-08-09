"use client";

import * as React from "react";
import Link from "next/link";
import {
  Badge,
  buttonVariants,
  Card,
  HeroCard,
  HeroChip,
  ProgressBar,
  Screen,
} from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import {
  CheckIcon,
  ChevronDownIcon,
  FlagIcon,
  UsersIcon,
} from "@/components/app/icons";
import { RewardLadder } from "@/components/app/roadmap-rewards";
import { RoadmapItemCard } from "@/components/app/roadmap-item-card";
import { RoadmapSwitcher } from "@/components/app/roadmap-switcher";
import { usePropState } from "@/lib/use-prop-state";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  categoriesAt,
  categoryComplete,
  categoryPct,
  currentLevel,
  itemsIn,
  levelComplete,
  levelPct,
  levelsComplete,
  levelsOf,
  programmeWindow,
  requirementFor,
  type Roadmap,
} from "@/lib/roadmap";
import { setRoadmapProgress } from "./actions";

/**
 * A plain calendar date, read at UTC so no zone can shift the day shown.
 *
 * The YEAR appears whenever it is not the member's current one. "closes 31
 * December" is unambiguous inside the programme's own year and actively
 * misleading outside it — a closed 2026 programme read as though it closes this
 * December, which is the same failure as the "0 days left" it sat beside.
 */
const fmtDate = (iso: string, todayISO: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: iso.slice(0, 4) === todayISO.slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC",
  });

export function RoadmapClient({
  roadmap,
  todayISO,
  groupId,
  programmes,
  canAdminister,
}: {
  roadmap: Roadmap;
  /** The member's own today (D34) — the window is counted on their calendar. */
  todayISO: string;
  groupId: string;
  /** Everything this circle follows (0028). One is the ordinary case. */
  programmes: { id: string; name: string }[];
  /**
   * Owner or co-admin of THIS circle — they get the strip below (D59). Not a
   * permission: `/programme/progress` is scoped by RLS and the item editor
   * refuses a non-organiser regardless. Hiding the links from a plain member is
   * so the screen says what it is for, not so it is safe.
   */
  canAdminister: boolean;
}) {
  // Optimistic display, re-seeded whenever the server delivers a new list.
  const [items, setItems] = usePropState(roadmap.items);
  const [error, setError] = React.useState<string | null>(null);

  // The last value the SERVER confirmed for each item — what a failed write
  // falls back to. Without it a failure would revert to a stale prop, which on
  // this screen means showing progress the member had already recorded.
  //
  // Re-seeded with the prop, exactly as `usePropState` re-seeds `items` above.
  // Seeded ONCE by `useRef`'s initial argument it was never refreshed, so after
  // a genuine server refetch a failed write rolled the row back PAST the
  // refetch, to whatever the first render happened to hold — the stale value
  // this ref exists to avoid.
  //
  // In an effect, not during render: mutating a ref while rendering is the
  // `react-hooks/refs` error, and it would be wrong here anyway. Nothing can
  // read this before the first commit — the only reader is a tap handler.
  const confirmed = React.useRef(
    new Map(roadmap.items.map((i) => [i.id, i.done])),
  );
  React.useEffect(() => {
    confirmed.current = new Map(roadmap.items.map((i) => [i.id, i.done]));
  }, [roadmap.items]);

  // One write at a time PER ITEM, in the order the taps happened. The controls
  // send an ABSOLUTE value, so two in flight at once can land out of order and
  // let the loser win — the count-dip family (§4) in a second place. The count
  // screen solved it with a single serialized queue; this is the same idea,
  // keyed per item because two different items never race each other.
  const chains = React.useRef(new Map<string, Promise<void>>());
  // The most recent value the member has ASKED for, per item. A response is only
  // allowed to touch the display if it is still the latest intent — otherwise an
  // earlier reply would clobber a later tap.
  const latest = React.useRef(new Map<string, number>());

  const setDone = (id: string, next: number) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const target = Math.max(0, Math.min(item.target, next));
    latest.current.set(id, target);
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, done: target } : i)),
    );
    setError(null);

    const run = async () => {
      const res = await setRoadmapProgress(id, target);
      if (latest.current.get(id) !== target) return; // a newer tap won

      if (!res || res.error || res.done == null) {
        const fallback = confirmed.current.get(id) ?? 0;
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, done: fallback } : i)),
        );
        setError("That didn't save. Check your connection and try again.");
        return;
      }

      // Reconcile from the write's own return (D45), never a refetch — and it is
      // the SERVER's clamp, so an item whose target moved under us corrects
      // itself here rather than showing a number the database refused.
      confirmed.current.set(id, res.done);
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, done: res.done! } : i)),
      );
    };

    const prev = chains.current.get(id) ?? Promise.resolve();
    chains.current.set(id, prev.then(run, run));
  };

  const reqs = roadmap.requirements;
  const levels = levelsOf(items);
  const done = levelsComplete(items, reqs);
  const current = currentLevel(items, reqs);
  const phase = programmeWindow(roadmap.startsOn, roadmap.endsOn, todayISO);

  // `currentLevel` returns null for TWO different situations, and the hero used
  // to render both as "Programme complete · 100%": everything finished, and
  // there being nothing to finish. A published roadmap whose items have not
  // landed yet — staged early, or authored in a second migration — congratulated
  // every member on completing it, under a caption reading "0 levels · none
  // finished yet". The SQL guards this exact case in `level_complete` (an empty
  // level is not a finished one, pgTAP 014); the screen did not.
  const empty = levels.length === 0;
  const finished = !empty && current === null;

  // Open the level the member is actually on. A finished programme opens the
  // last level rather than nothing, so the screen is never blank.
  const [open, setOpen] = React.useState<number>(
    current ?? levels[levels.length - 1] ?? 1,
  );

  // Which CATEGORIES are open, keyed `level:category` so the key stays unique
  // across stations.
  //
  // A SET, not a single value, and that is not a detail. The levels are
  // one-at-a-time because a member walks them in order (D55) and only one is
  // ever theirs. Categories are not like that: finishing a book and then
  // logging the minutes you listened to are the same sitting, and a single-open
  // accordion makes the second action close the first. The first cut of this
  // screen got it wrong and the e2e suite is what said so — every existing test
  // had to reach past a category it had just collapsed.
  const [openCats, setOpenCats] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleCat = (key: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <Screen>
      <PageHeader
        title="Roadmap"
        subtitle={
          <span className="text-balance">
            <span className="font-semibold text-foreground">
              {roadmap.name}
            </span>{" "}
            ·{" "}
            {phase.state === "closed"
              ? `closed ${fmtDate(roadmap.endsOn, todayISO)}`
              : phase.state === "upcoming"
                ? `opens ${fmtDate(roadmap.startsOn, todayISO)}`
                : `closes ${fmtDate(roadmap.endsOn, todayISO)}`}
          </span>
        }
      />

      <RoadmapSwitcher
        groupId={groupId}
        programmes={programmes}
        currentId={roadmap.id}
      />

      {/* THE ADMIN STRIP (D59) — for whoever leads this circle, and nobody
          else. Two jobs live off this screen and both used to be a scavenger
          hunt: "how is everyone getting on" was a link at the foot of Manage,
          and the programme's own content — the item editor with it — was behind
          a section heading on the report that happened to be a link.

          QUIET on purpose. The accent is reserved for the member's own earned
          action (§ design system), and an admin is a member here too: their
          progress is the screen, this is the margin. */}
      {canAdminister && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/programme/progress"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              // Split the width on a phone, natural width above it — two
              // 470px buttons carrying three words each is what `flex-1`
              // alone does on a desktop column.
              className: "flex-1 sm:flex-none",
            })}
          >
            <UsersIcon aria-hidden className="size-4" />
            Members&rsquo; progress
          </Link>
          <Link
            href={`/programme/${roadmap.id}`}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              // Split the width on a phone, natural width above it — two
              // 470px buttons carrying three words each is what `flex-1`
              // alone does on a desktop column.
              className: "flex-1 sm:flex-none",
            })}
          >
            <FlagIcon aria-hidden className="size-4" />
            Open programme
          </Link>
        </div>
      )}

      {/* The screen's ONE hero, and it reports the LEVEL — the unit the
          programme is built in and rewarded on. A single percentage across all
          three levels would be a number nobody is working toward. */}
      <HeroCard
        medallion={
          <FlagIcon
            className="size-8"
            style={{ color: "var(--gradient-hero-accent)" }}
          />
        }
        label={
          current
            ? `Level ${current}`
            : finished
              ? "Programme complete"
              : "Not published yet"
        }
        stat={
          current
            ? `${levelPct(items, reqs, current)}%`
            : finished
              ? "100%"
              : "—"
        }
        caption={
          empty
            ? "This programme has no work on it yet"
            : done === 0
              ? `${levels.length} levels · none finished yet`
              : `${done} of ${levels.length} levels finished`
        }
        trailing={
          // "0 days left" was what a closed programme said, every day, forever —
          // and it is also what the LAST day of an open one says, so the two
          // could not be told apart. The window is a state, not a countdown that
          // bottoms out (`programmeWindow`, D34).
          <HeroChip>
            {phase.state === "closed"
              ? "Closed"
              : phase.state === "upcoming"
                ? `Opens in ${phase.days.toLocaleString()} day${phase.days === 1 ? "" : "s"}`
                : `${phase.days.toLocaleString()} day${phase.days === 1 ? "" : "s"} left`}
          </HeroChip>
        }
      />

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {/* Rewards — what the whole programme is pulling toward. Placed ABOVE the
          work: a year-long list with no visible destination is just homework,
          and the ladder is the only thing on this screen that answers "why". */}
      <Card padding="md">
        <SectionHeading>Rewards</SectionHeading>
        <RewardLadder
          rewards={roadmap.rewards}
          levelsDone={done}
          totalLevels={levels.length}
        />
      </Card>

      {/* THE TIMELINE. Levels are stations on one spine, walked in order, and
          the spine is the point: a roadmap of 46 items across three stages is
          a journey, and a flat list of collapsed panels does not read as one.
          Each station opens to its categories, and each category opens to its
          items — two levels of disclosure, because opening a level and getting
          forty cards is the wall this replaced.

          <ol>, not <div>s: the levels ARE an ordered sequence (D55 — level 2
          continues where level 1 stopped), and a screen reader should hear that
          without needing the spine, which is decorative and aria-hidden. */}
      <ol className="flex flex-col">
        {levels.map((level, idx) => {
          const lvlComplete = levelComplete(items, reqs, level);
          const isOpen = open === level;
          const isLast = idx === levels.length - 1;
          const cats = categoriesAt(items, level);

          return (
            <li key={level} className="relative pl-11">
              {/* The spine. Stops at the last station rather than running off
                  the end of the list — a line into nothing reads as content
                  that failed to load. */}
              {!isLast && (
                <span
                  aria-hidden
                  className="absolute top-6 bottom-0 left-[15px] w-0.5 bg-progress-track"
                />
              )}

              {/* The station. `ring-background` punches it out of the spine so
                  the line appears to pass behind rather than through it. */}
              <span
                aria-hidden
                className={cn(
                  "absolute top-1 left-0 grid size-8 place-items-center rounded-full text-xs font-bold tabular-nums ring-4 ring-background",
                  lvlComplete
                    ? "bg-primary text-primary-foreground"
                    : level === current
                      ? "bg-primary-100 text-primary-800 ring-4"
                      : "bg-progress-track text-muted-foreground",
                )}
              >
                {lvlComplete ? <CheckIcon className="size-4" /> : level}
              </span>

              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : level)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 rounded-xl py-1.5 pr-2 text-left transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-display text-base font-bold text-foreground">
                      Level {level}
                    </p>
                    {/* Never colour alone (§5) — and never "Locked" either.
                        Nothing refuses a write to a later level:
                        `set_roadmap_progress` checks the roadmap is followed
                        and clamps to the target, and that is all. A badge
                        saying Locked would be the screen inventing a rule the
                        database does not keep, which is the nav bug again. */}
                    {lvlComplete ? (
                      <Badge variant="primary" size="sm">
                        Complete
                      </Badge>
                    ) : level === current ? (
                      <Badge variant="outline" size="sm">
                        In progress
                      </Badge>
                    ) : (
                      <Badge variant="outline" size="sm">
                        Not started
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {levelPct(items, reqs, level)}%
                    </span>
                  </div>
                  <ProgressBar
                    value={levelPct(items, reqs, level)}
                    tone={lvlComplete ? "success" : "primary"}
                    className="mt-2 h-1.5"
                  />
                </div>
                <ChevronDownIcon
                  aria-hidden
                  className={cn(
                    "size-5 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              <div
                className={cn(
                  "flex flex-col gap-2",
                  isOpen ? "mt-3 pb-8" : "pb-6",
                )}
              >
                {isOpen &&
                  cats.map((category) => {
                    const group = itemsIn(items, level, category);
                    const req = requirementFor(reqs, level, category);
                    const catDone = categoryComplete(
                      items,
                      reqs,
                      level,
                      category,
                    );
                    const total = group.reduce(
                      (n, i) => n + Math.min(i.done, i.target),
                      0,
                    );
                    const key = `${level}:${category}`;
                    const catOpen = openCats.has(key);
                    const covers = group.filter((i) => i.imageUrl).slice(0, 4);

                    return (
                      <div
                        key={category}
                        className={cn(
                          "overflow-hidden rounded-2xl border bg-card",
                          catDone ? "border-primary-300" : "border-border",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleCat(key)}
                          aria-expanded={catOpen}
                          className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-hover"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <p className="text-sm font-semibold text-foreground">
                                {CATEGORY_LABEL[category]}
                              </p>
                              {catDone && (
                                <Badge variant="primary" size="sm">
                                  Done
                                </Badge>
                              )}
                            </div>
                            {/* A budgeted category reports against its BUDGET
                                ("302 of 600 minutes"), because that is the rule
                                it is judged by. Counting items finished would
                                be a different, misleading number: level 1 has
                                ten lectures on the menu and no requirement to
                                watch all ten. */}
                            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                              {req
                                ? `${total.toLocaleString()} of ${req.minTotal.toLocaleString()} ${group[0]?.unit ?? ""}`
                                : `${group.filter((i) => i.done >= i.target).length} of ${group.length} done`}
                            </p>
                            {req && (
                              <ProgressBar
                                value={categoryPct(
                                  items,
                                  reqs,
                                  level,
                                  category,
                                )}
                                tone={catDone ? "success" : "primary"}
                                className="mt-2 h-1"
                              />
                            )}

                            {/* A glance at what is inside, without opening it.
                                Only where there is real artwork — an icon
                                strip would be decoration standing in for
                                information. */}
                            {!catOpen && covers.length > 0 && (
                              <div aria-hidden className="mt-3 flex gap-2">
                                {covers.map((i) => (
                                  // eslint-disable-next-line @next/next/no-img-element -- organiser-editable host; see roadmap-item-card.tsx
                                  <img
                                    key={i.id}
                                    src={i.imageUrl!}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="h-16 w-11 rounded-md border border-border object-cover shadow-sm"
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <ChevronDownIcon
                            aria-hidden
                            className={cn(
                              "size-5 shrink-0 text-muted-foreground transition-transform",
                              catOpen && "rotate-180",
                            )}
                          />
                        </button>

                        {catOpen && (
                          <ul className="flex flex-col gap-3 border-t border-border bg-muted/30 p-3">
                            {group.map((item) => (
                              <RoadmapItemCard
                                key={item.id}
                                item={item}
                                onChange={(d) => setDone(item.id, d)}
                              />
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Said plainly, on the screen where the recording happens. Progress goes
          to the people who hand over the rewards — that is the deal, and a
          member who is not told is being read without knowing (D55). */}
      <p className="px-1 text-center text-xs text-muted-foreground">
        Your circle&rsquo;s admins and the programme&rsquo;s organisers can see
        how far you&rsquo;ve got. Nothing here affects your streak, your rings
        or your circle&rsquo;s figures.
      </p>
    </Screen>
  );
}

"use client";

import * as React from "react";
import {
  Badge,
  Card,
  HeroCard,
  HeroChip,
  ProgressBar,
  Screen,
} from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { CheckIcon, ChevronDownIcon, FlagIcon } from "@/components/app/icons";
import { RewardLadder } from "@/components/app/roadmap-rewards";
import { RoadmapItemCard } from "@/components/app/roadmap-item-card";
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
}: {
  roadmap: Roadmap;
  /** The member's own today (D34) — the window is counted on their calendar. */
  todayISO: string;
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

      {/* One accordion section per level. Levels are walked in ORDER, so the
          finished ones collapse to a tick and the one in hand is open — the
          alternative is a single scroll of ninety items where the fifteen that
          are yours this year are indistinguishable from the rest. */}
      {levels.map((level) => {
        const lvlComplete = levelComplete(items, reqs, level);
        const isOpen = open === level;
        const cats = categoriesAt(items, level);

        return (
          <section key={level}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? -1 : level)}
              aria-expanded={isOpen}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors",
                "hover:bg-surface-hover active:bg-surface-active",
                lvlComplete ? "border-primary-300" : "border-border",
              )}
            >
              <div
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl font-semibold tabular-nums",
                  lvlComplete
                    ? "bg-primary-100 text-primary-800"
                    : level === current
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {lvlComplete ? (
                  <CheckIcon aria-hidden className="size-5" />
                ) : (
                  level
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Level {level}
                  </p>
                  {/* Never colour alone (§5) — the state is also a word. */}
                  {lvlComplete ? (
                    <Badge variant="primary" size="sm">
                      Complete
                    </Badge>
                  ) : level === current ? (
                    <Badge variant="outline" size="sm">
                      In progress
                    </Badge>
                  ) : null}
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

            {isOpen && (
              <div className="mt-3 flex flex-col gap-5">
                {cats.map((category) => {
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

                  return (
                    <div key={category}>
                      <SectionHeading
                        action={
                          // A budgeted category reports against its BUDGET
                          // ("302 of 600 minutes"), because that is the rule it
                          // is judged by. Counting items finished would be a
                          // different, misleading number: at level 1 there are
                          // ten lectures on the menu and no requirement to
                          // watch all ten.
                          req
                            ? `${total.toLocaleString()} of ${req.minTotal.toLocaleString()} ${group[0]?.unit ?? ""}`
                            : `${group.filter((i) => i.done >= i.target).length} of ${group.length} done`
                        }
                      >
                        {CATEGORY_LABEL[category]}
                      </SectionHeading>

                      {req && (
                        <ProgressBar
                          value={categoryPct(items, reqs, level, category)}
                          tone={catDone ? "success" : "primary"}
                          className="mb-3 h-1.5"
                        />
                      )}

                      <ul className="flex flex-col gap-3">
                        {group.map((item) => (
                          <RoadmapItemCard
                            key={item.id}
                            item={item}
                            onChange={(d) => setDone(item.id, d)}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

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

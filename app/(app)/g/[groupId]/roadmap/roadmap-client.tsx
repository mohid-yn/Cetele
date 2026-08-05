"use client";

import * as React from "react";
import { Card, HeroCard, HeroChip, ProgressBar, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { FlagIcon } from "@/components/app/icons";
import { RewardLadder } from "@/components/app/roadmap-rewards";
import { RoadmapItemCard } from "@/components/app/roadmap-item-card";
import { usePropState } from "@/lib/use-prop-state";
import {
  completedItems,
  daysLeft,
  overallPct,
  type Roadmap,
  type RoadmapItemKind,
} from "@/lib/roadmap";
import { setRoadmapProgress } from "./actions";

/** Section order and headings. `custom` last — it is the catch-all. */
const SECTIONS: { kind: RoadmapItemKind; heading: string }[] = [
  { kind: "watch", heading: "Watch" },
  { kind: "read", heading: "Read" },
  { kind: "custom", heading: "Also on the roadmap" },
];

/** A plain calendar date, read at UTC so no zone can shift the day shown. */
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
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
  const confirmed = React.useRef(
    new Map(roadmap.items.map((i) => [i.id, i.done])),
  );

  // One write at a time PER ITEM, in the order the taps happened. The ± buttons
  // send an ABSOLUTE value, so two in flight at once can land out of order and
  // let the loser win — the count-dip family (§4) in a second place. The count
  // screen solved it with a single serialized queue; this is the same idea,
  // keyed per item because two different items never race each other.
  const chains = React.useRef(new Map<string, Promise<void>>());
  // The most recent value the member has ASKED for, per item. A response is
  // only allowed to touch the display if it is still the latest intent —
  // otherwise an earlier reply would clobber a later tap.
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

      if (res.error || res.done == null) {
        const fallback = confirmed.current.get(id) ?? 0;
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, done: fallback } : i)),
        );
        setError("That didn't save. Check your connection and try again.");
        return;
      }

      // Reconcile from the write's own return (D45), never a refetch — and it
      // is the SERVER's clamp, so an item whose target moved under us corrects
      // itself here rather than showing a number the database refused.
      confirmed.current.set(id, res.done);
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, done: res.done! } : i)),
      );
    };

    const prev = chains.current.get(id) ?? Promise.resolve();
    chains.current.set(id, prev.then(run, run));
  };

  const complete = completedItems(items);
  const pct = overallPct(items);
  const left = daysLeft(roadmap.endsOn, todayISO);

  return (
    <Screen>
      <PageHeader
        title="Roadmap"
        subtitle={
          <span className="text-balance">
            <span className="font-semibold text-foreground">
              {roadmap.name}
            </span>{" "}
            · closes {fmtDate(roadmap.endsOn)}
          </span>
        }
      />

      {/* The screen's ONE hero. Progress is unit-weighted, so a long playlist
          moves the number as you go rather than only when it lands. */}
      <HeroCard
        medallion={
          <FlagIcon
            className="size-8"
            style={{ color: "var(--gradient-hero-accent)" }}
          />
        }
        label="Roadmap progress"
        stat={`${pct}%`}
        caption={`${complete} of ${items.length} items complete`}
        // Days left, not the next reward: the reward is already named on the
        // ladder below with its own distance, and a hero chip long enough to
        // hold "Next: Retreat place held" pushed the caption onto two lines at
        // 390. The chip takes the fact the ladder does NOT carry.
        trailing={
          <HeroChip>
            {left.toLocaleString()} day{left === 1 ? "" : "s"} left
          </HeroChip>
        }
      />

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {/* Rewards — what the whole programme is pulling toward. Placed ABOVE the
          items: a year-long list with no visible destination is just homework,
          and the ladder is the only thing on this screen that answers "why". */}
      <Card padding="md">
        {/* No trailing count here: the hero caption already says "N of M items
            complete", and the ladder names the next reward with its own
            distance. A third copy of the same number is noise. */}
        <SectionHeading>Rewards</SectionHeading>
        <ProgressBar value={pct} className="mb-5" />
        <RewardLadder
          rewards={roadmap.rewards}
          complete={complete}
          total={items.length}
        />
      </Card>

      {SECTIONS.map(({ kind, heading }) => {
        const group = items.filter((i) => i.kind === kind);
        if (!group.length) return null;
        const doneHere = group.filter((i) => i.done >= i.target).length;

        return (
          <section key={kind}>
            <SectionHeading action={`${doneHere} of ${group.length} done`}>
              {heading}
            </SectionHeading>
            <ul className="flex flex-col gap-3">
              {group.map((item) => (
                <RoadmapItemCard
                  key={item.id}
                  item={item}
                  onChange={(done) => setDone(item.id, done)}
                />
              ))}
            </ul>
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

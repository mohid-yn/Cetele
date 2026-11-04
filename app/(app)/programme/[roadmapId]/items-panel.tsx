"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui";
import {
  BookIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  LockIcon,
  PlayIcon,
  PlusIcon,
} from "@/components/app/icons";
import { RoadmapCover } from "@/components/app/roadmap-cover";
import { usePropState } from "@/lib/use-prop-state";
import { DURATION, easeBrand } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  categoriesAt,
  itemsIn,
  levelsOf,
  requirementFor,
  type LevelRequirement,
  type RoadmapCategory,
  type RoadmapItem,
} from "@/lib/roadmap";
import { reorderRoadmapItems } from "./authoring-actions";
import { ItemSheet, type SheetItem } from "./item-sheet";
import { ScoringDialog } from "./scoring-dialog";

type SheetState = {
  /** New per opening, so the form always seeds from current data. */
  key: number;
  item: SheetItem | null;
  level: number;
};

type ScoringState = { level: number; category: RoadmapCategory };

/**
 * The roadmap's content, by level then category (D72).
 *
 * A row opens the one item form. Ordering is a mode you turn on per category, so
 * arrows don't take width from every title all the time. Levels collapse because
 * a real roadmap has forty-odd items. A level exists once it has an item, so
 * "Add level" simply opens the form at the next number.
 */
export function ItemsPanel({
  roadmapId,
  items: serverItems,
  requirements,
  recordedIds,
  sortOrders,
  anyRecorded,
}: {
  roadmapId: string;
  items: RoadmapItem[];
  requirements: LevelRequirement[];
  recordedIds: ReadonlySet<string>;
  sortOrders: ReadonlyMap<string, number>;
  anyRecorded: boolean;
}) {
  const [items, setItems] = usePropState(serverItems);
  const [sheet, setSheet] = React.useState<SheetState | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [scoring, setScoring] = React.useState<ScoringState | null>(null);
  const [reordering, setReordering] = React.useState<string | null>(null);
  const [moveError, setMoveError] = React.useState<string | null>(null);
  const levels = levelsOf(items);
  const [openLevels, setOpenLevels] = React.useState<ReadonlySet<number>>(
    () => new Set(levels.slice(0, 1)),
  );

  // Moves go out one at a time, in order, so a quick second tap can't overtake
  // the first and leave the database holding the older order.
  const moves = React.useRef<Promise<void>>(Promise.resolve());

  const toggleLevel = (level: number) =>
    setOpenLevels((prev) => {
      const next = new Set(prev);
      if (!next.delete(level)) next.add(level);
      return next;
    });

  const openSheet = (item: SheetItem | null, level: number) => {
    setOpenLevels((prev) => new Set(prev).add(level));
    setSheet((s) => ({ key: (s?.key ?? 0) + 1, item, level }));
    setSheetOpen(true);
  };

  const toSheetItem = (i: RoadmapItem): SheetItem => ({
    id: i.id,
    level: i.level,
    category: i.category,
    title: i.title,
    source: i.source,
    unit: i.unit,
    target: i.target,
    compulsory: i.compulsory,
    url: i.url,
    description: i.description,
    imageUrl: i.imageUrl,
    sortOrder: sortOrders.get(i.id) ?? 0,
    recorded: recordedIds.has(i.id),
  });

  const move = (
    level: number,
    category: RoadmapCategory,
    index: number,
    delta: -1 | 1,
  ) => {
    const group = itemsIn(items, level, category);
    const target = index + delta;
    if (target < 0 || target >= group.length) return;
    const reordered = [...group];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];

    const previous = items;
    let n = 0;
    setItems(
      items.map((i) =>
        i.level === level && i.category === category ? reordered[n++] : i,
      ),
    );
    setMoveError(null);
    moves.current = moves.current.then(async () => {
      const res = await reorderRoadmapItems(
        roadmapId,
        level,
        category,
        reordered.map((i) => i.id),
      );
      if (res.error) {
        setItems(previous);
        setMoveError(res.error);
      }
    });
  };

  const nextSortOrder = (level: number, category: RoadmapCategory) => {
    const orders = items
      .filter((i) => i.level === level && i.category === category)
      .map((i) => sortOrders.get(i.id) ?? 0);
    return Math.max(0, ...orders) + 1;
  };

  const nextLevel = Math.max(0, ...levels) + 1;
  const scoringGroup = scoring
    ? itemsIn(items, scoring.level, scoring.category)
    : [];

  return (
    <div className="flex flex-col gap-4">
      {levels.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-outline p-5">
          <div>
            <p className="font-semibold text-foreground">Start with level 1</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add what a member has to read, memorise or listen to. A new level
              starts when you need one.
            </p>
          </div>
          <Button variant="primary" onClick={() => openSheet(null, 1)}>
            <PlusIcon aria-hidden />
            Add item
          </Button>
        </div>
      ) : (
        levels.map((level) => {
          const isOpen = openLevels.has(level);
          const count = items.filter((i) => i.level === level).length;
          return (
            <section
              key={level}
              className="rounded-2xl border border-border bg-card"
            >
              <div className="flex items-center gap-1 p-1.5">
                <h2 className="min-w-0 flex-1">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleLevel(level)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 text-left font-display text-base font-bold text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover"
                  >
                    <ChevronDownIcon
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--duration-fast)] ease-[var(--ease-brand)]",
                        !isOpen && "-rotate-90",
                      )}
                    />
                    Level {level}
                  </button>
                </h2>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {count} {count === 1 ? "item" : "items"}
                </span>
                <Button
                  variant="tonal"
                  size="sm"
                  className="mr-1.5 shrink-0"
                  aria-label={`Add item to level ${level}`}
                  onClick={() => openSheet(null, level)}
                >
                  <PlusIcon aria-hidden />
                  Add
                </Button>
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    className="overflow-hidden"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={easeBrand(DURATION.base)}
                  >
                    {categoriesAt(items, level).map((category) => {
                      const group = itemsIn(items, level, category);
                      const req = requirementFor(requirements, level, category);
                      const key = `${level}:${category}`;
                      const ordering = reordering === key;
                      return (
                        <div key={category} className="border-t border-border">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 px-4 pt-3 pb-1">
                            <h3 className="text-sm font-semibold text-foreground">
                              {CATEGORY_LABEL[category]}
                            </h3>
                            <div className="flex items-center gap-1">
                              {group.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-pressed={ordering}
                                  onClick={() =>
                                    setReordering(ordering ? null : key)
                                  }
                                >
                                  {ordering ? "Done" : "Reorder"}
                                </Button>
                              )}
                              {anyRecorded ? (
                                <span className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground tabular-nums">
                                  <LockIcon aria-hidden className="size-3.5" />
                                  {req
                                    ? `Choose ${req.minTotal} ${group[0]?.unit ?? ""}`
                                    : group.length === 1
                                      ? "Finish it"
                                      : `Finish all ${group.length}`}
                                </span>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="tabular-nums"
                                  aria-label={`Change how ${CATEGORY_LABEL[category]} at level ${level} is finished. ${
                                    req
                                      ? `Currently choose ${req.minTotal} ${group[0]?.unit ?? ""}`
                                      : `Currently finish all ${group.length}`
                                  }`}
                                  onClick={() =>
                                    setScoring({ level, category })
                                  }
                                >
                                  {req
                                    ? `Choose ${req.minTotal} ${group[0]?.unit ?? ""}`
                                    : group.length === 1
                                      ? "Finish it"
                                      : `Finish all ${group.length}`}
                                </Button>
                              )}
                            </div>
                          </div>
                          <ul className="pb-1.5">
                            {group.map((i, index) => (
                              <motion.li
                                key={i.id}
                                layout="position"
                                transition={easeBrand(DURATION.fast)}
                                className="flex items-center gap-1 px-1.5"
                              >
                                <button
                                  type="button"
                                  aria-label={`Edit ${i.title}`}
                                  onClick={() =>
                                    openSheet(toSheetItem(i), level)
                                  }
                                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover active:bg-surface-active"
                                >
                                  <RoadmapCover
                                    imageUrl={i.imageUrl}
                                    className="w-8"
                                    fallback={
                                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container">
                                        {i.category === "listening" ? (
                                          <PlayIcon
                                            aria-hidden
                                            className="size-4"
                                          />
                                        ) : (
                                          <BookIcon
                                            aria-hidden
                                            className="size-4"
                                          />
                                        )}
                                      </span>
                                    }
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium wrap-anywhere text-foreground">
                                      {i.title}
                                    </span>
                                    <ItemMeta item={i} />
                                  </span>
                                  {recordedIds.has(i.id) && (
                                    <LockIcon
                                      aria-label="Members have started this"
                                      className="size-3.5 shrink-0 text-muted-foreground"
                                    />
                                  )}
                                  {!ordering && (
                                    <ChevronRightIcon
                                      aria-hidden
                                      className="size-4 shrink-0 text-muted-foreground"
                                    />
                                  )}
                                </button>
                                {ordering && (
                                  <span className="flex shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={index === 0}
                                      aria-label={`Move ${i.title} up`}
                                      onClick={() =>
                                        move(level, category, index, -1)
                                      }
                                    >
                                      <ChevronUpIcon aria-hidden />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={index === group.length - 1}
                                      aria-label={`Move ${i.title} down`}
                                      onClick={() =>
                                        move(level, category, index, 1)
                                      }
                                    >
                                      <ChevronDownIcon aria-hidden />
                                    </Button>
                                  </span>
                                )}
                              </motion.li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })
      )}

      {moveError && (
        <p role="alert" className="text-sm text-danger">
          {moveError}
        </p>
      )}

      {levels.length > 0 && (
        <Button
          variant="tonal"
          className="self-start"
          onClick={() => openSheet(null, nextLevel)}
        >
          <PlusIcon aria-hidden />
          Add level {nextLevel}
        </Button>
      )}

      {sheet && (
        <ItemSheet
          key={sheet.key}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          roadmapId={roadmapId}
          item={sheet.item}
          level={sheet.level}
          levels={levels}
          nextSortOrder={nextSortOrder}
        />
      )}

      {scoring && (
        <ScoringDialog
          key={`${scoring.level}:${scoring.category}`}
          open
          onClose={() => setScoring(null)}
          roadmapId={roadmapId}
          level={scoring.level}
          category={scoring.category}
          categoryLabel={CATEGORY_LABEL[scoring.category]}
          unit={scoringGroup[0]?.unit ?? ""}
          available={scoringGroup.reduce((sum, i) => sum + i.target, 0)}
          itemCount={scoringGroup.length}
          minTotal={
            requirementFor(requirements, scoring.level, scoring.category)
              ?.minTotal ?? null
          }
        />
      )}
    </div>
  );
}

function ItemMeta({ item }: { item: RoadmapItem }) {
  const parts = [
    item.source,
    // "1 book" says nothing the title doesn't, so a target of 1 is left out.
    item.target === 1 ? null : `${item.target} ${item.unit}`,
    item.compulsory ? "Required" : null,
    item.category === "listening" && !item.url ? "No link yet" : null,
  ].filter((p): p is string => p != null && p !== "");

  if (parts.length === 0) return null;
  return (
    <span className="mt-0.5 block text-xs wrap-anywhere text-muted-foreground">
      {parts.join(" · ")}
    </span>
  );
}

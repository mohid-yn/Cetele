"use client";

import * as React from "react";
import { Badge, Button, buttonVariants, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  BookIcon,
  CheckIcon,
  ExternalLinkIcon,
  MinusIcon,
  PlayIcon,
  PlusIcon,
  SparkIcon,
} from "@/components/app/icons";
import { isItemComplete, type RoadmapItem } from "@/lib/roadmap";

const KIND_ICON = {
  watch: PlayIcon,
  read: BookIcon,
  custom: SparkIcon,
} as const;

/**
 * What the outbound link is called, per kind. "Open source" was the first
 * wording and it is a trap: on a video row it reads as open-SOURCE software,
 * not "the source it comes from".
 */
const KIND_LINK_LABEL = {
  watch: "Open playlist",
  read: "Open reading",
  custom: "Open link",
} as const;

/**
 * One roadmap item.
 *
 * The shape of this row is set by a fact the daily tasks do not have: the work
 * happens SOMEWHERE ELSE. You leave for YouTube or a book, come back, and say
 * how far you got — so the card leads with where it is, and recording is a
 * small acknowledgement afterwards rather than the main event. That is the
 * opposite of the count screen, where tapping IS the worship.
 *
 * Recording is deliberately reversible. The daily engine had to learn this the
 * hard way (the count screen's undo/edit tray) — a number a member can only
 * push upward is a number they will eventually be afraid to touch.
 */
export function RoadmapItemCard({
  item,
  onChange,
}: {
  item: RoadmapItem;
  /** Report the new `done` value. Clamped by the caller's reducer. */
  onChange: (done: number) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const complete = isItemComplete(item);
  const pct = item.target ? Math.min(100, (item.done / item.target) * 100) : 0;
  // A one-unit item is a yes/no thing (attend the session, finish the essay),
  // and a "+1 of 1" counter for it is ceremony. It gets a single toggle.
  const binary = item.target === 1;

  return (
    <li
      className={cn(
        "rounded-2xl border bg-card p-4 transition-colors",
        complete ? "border-primary-300" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            complete
              ? "bg-primary-100 text-primary-800"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon aria-hidden className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-foreground">
              {item.title}
            </p>
            {/* Never colour alone — completion is also a word (§5). */}
            {complete && (
              <Badge variant="primary" size="sm">
                <CheckIcon aria-hidden className="mr-1 inline size-3" />
                Complete
              </Badge>
            )}
          </div>

          {item.source && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.source}
            </p>
          )}

          {/* An external destination, so it opens away from the app and says
              so. `noreferrer` because the roadmap is the administration's, and
              nothing about a member's session belongs in a third party's
              referer log. `buttonVariants` rather than <Button> — the primitive
              renders a <button>, and this has to be a real anchor. */}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "link", size: "inline" }),
                "mt-1.5 gap-1 text-xs",
              )}
            >
              {KIND_LINK_LABEL[item.kind]}
              <ExternalLinkIcon aria-hidden className="size-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <ProgressBar
            value={pct}
            tone={complete ? "success" : "primary"}
            className="h-1.5"
          />
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {binary
              ? complete
                ? "Done"
                : "Not started"
              : `${item.done} of ${item.target} ${item.unit}`}
          </p>
        </div>

        {/* All `outline`, never `ghost`. A ghost control standing alone on a
            card has no resting fill and a transparent edge — the "is that even
            a button?" read the §4 button invariant exists to stop. It bit here
            in the obvious way: a bare `−` glyph beside a bordered `+` in the
            SAME cluster, which is the one place an unmatched pair is most
            visible. Quiet is earned by weight and order, not by removing the
            edge. */}
        {binary ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(complete ? 0 : 1)}
          >
            {complete ? "Undo" : "Mark done"}
          </Button>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              // "one" alone, not "one ${unit}": `unit` is stored PLURAL, for
              // the "3 of 24 videos" reading, so interpolating it here produced
              // "Remove one videos from…" — the label a screen reader actually
              // says out loud. Singularising by chopping an "s" is a trap in a
              // list an admin writes freely ("sessions" → fine, "majlis" → not).
              aria-label={`Remove one from ${item.title}`}
              disabled={item.done === 0}
              onClick={() => onChange(item.done - 1)}
            >
              <MinusIcon aria-hidden className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Add one to ${item.title}`}
              disabled={complete}
              onClick={() => onChange(item.done + 1)}
            >
              <PlusIcon aria-hidden className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

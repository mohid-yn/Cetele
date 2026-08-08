"use client";

import Link from "next/link";
import { Eyebrow } from "@/components/ui";
import { cn } from "@/lib/utils";
import { groupHref } from "@/lib/group-href";

/**
 * Which programme this screen is showing, when the circle follows more than one
 * (0028, D58).
 *
 * LINKS, not a <select>, and not a menu. Each programme is a real URL
 * (`?r=<id>`), so switching is a navigation: it can be prefetched, shared,
 * bookmarked and gone Back from, and the server picks the programme rather than
 * the client holding it in state. A `<select>` would have made the choice
 * invisible to the URL and unrecoverable on reload — and it carries the trap
 * this very screen's manage control was just rebuilt to escape, where a value
 * matching no option silently displays the first one.
 *
 * RENDERS NOTHING FOR ONE PROGRAMME, which is almost every circle. A switcher
 * with nothing to switch to is a control that does not work, and this screen
 * already names the programme in its own subtitle.
 *
 * A horizontal scroller rather than a wrapping row: programme names are long
 * ("Islamic Development Program"), and at 390px two of them wrap into a block
 * that pushes the whole roadmap down the page. Scrolling keeps the header one
 * line tall however many there are.
 */
export function RoadmapSwitcher({
  groupId,
  programmes,
  currentId,
}: {
  groupId: string;
  programmes: { id: string; name: string }[];
  currentId: string;
}) {
  if (programmes.length < 2) return null;

  return (
    <div>
      <Eyebrow as="p" className="mb-1.5">
        Programme
      </Eyebrow>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0">
        {programmes.map((p) => {
          const active = p.id === currentId;
          return (
            <Link
              key={p.id}
              href={`${groupHref(groupId, "/roadmap")}?r=${p.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary-container text-on-primary-container"
                  : "border-border bg-card text-muted-foreground hover:bg-surface-hover",
              )}
            >
              {p.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

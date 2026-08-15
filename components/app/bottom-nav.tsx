"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { springGlide } from "@/lib/motion";
import {
  isGroupPicker,
  navItemsWithRoadmap,
  noGroupNavItems,
  resolveNavItem,
} from "./nav-items";
import { navItemVariants } from "./nav-item-variants";
import { useActiveGroupId } from "@/lib/use-active-group";
import { useHasGroups } from "@/lib/use-has-groups";
import { useGroupHasRoadmap } from "@/lib/use-group-roadmap";
import { useIsSuperAdmin } from "@/lib/viewer-store";

/** Mobile tab bar pinned to the bottom of the app column (hidden on desktop). */
export function BottomNav({
  initialHasGroups,
  initialGroupId,
}: {
  initialHasGroups: boolean;
  initialGroupId: string | null;
}) {
  const pathname = usePathname();
  const groupId = useActiveGroupId(initialGroupId);
  const hasGroups = useHasGroups(initialHasGroups);
  // No circle yet → collapse to the front door + you (the group tabs would be
  // dead links to /groups).
  // Only for the circle in hand: mid-navigation between two circles the store
  // still holds the old one, and inheriting its answer is how a Roadmap tab
  // appears on a circle that has no programme.
  const hasRoadmap = useGroupHasRoadmap(groupId);
  // An organiser is in no circle by role (D27), so their Roadmap tab is the one
  // permanent thing in this bar that no group page can publish — it comes from
  // the client-side viewer store instead (D59).
  const isOrganiser = useIsSuperAdmin();
  // …and the same collapse on the picker itself, where no circle is selected.
  const items =
    hasGroups && !isGroupPicker(pathname)
      ? navItemsWithRoadmap(hasRoadmap, isOrganiser)
      : noGroupNavItems(isOrganiser);

  return (
    <nav
      aria-label="Primary"
      // `bg-chrome`, not `bg-card`: the nav is the FRAME, not content. Sharing
      // --card made it pure white at 1.08:1 against the page, which is why it
      // read as a blank slab. Chrome recedes below the page in both themes.
      className="shrink-0 border-t border-border bg-chrome shadow-up lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul
        className={cn(
          "mx-auto grid max-w-[28rem] gap-1 p-1.5",
          // Five tabs at 390px is ~72px each, which "Progress" fits at text-xs
          // with room to spare — measured, not assumed. The count is driven off
          // `items.length` rather than a second boolean so the grid can never
          // disagree with what is actually rendered.
          items.length === 5
            ? "grid-cols-5"
            : items.length === 4
              ? "grid-cols-4"
              : items.length === 3
                ? "grid-cols-3"
                : "grid-cols-2",
        )}
      >
        {items.map((item) => {
          const { href, active } = resolveNavItem(item, pathname, groupId);
          const { shortLabel, Icon } = item;
          return (
            <li key={shortLabel}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={navItemVariants({ layout: "stack", active })}
              >
                {/* The pill itself is what slides between tabs. It used to be a
                    2px bar pinned to the top edge, which reads as a ruler on
                    the frame rather than as the tab being selected — and it
                    left the item with no filled state to press against. It sits
                    BEHIND the content (-z-10 + a stacking context) so the label
                    never has to fight it. */}
                {active && (
                  <motion.span
                    aria-hidden
                    layoutId="bottom-nav-active"
                    transition={springGlide}
                    className="absolute inset-0 -z-10 rounded-lg bg-primary-container"
                  />
                )}
                <Icon className={cn("size-6", active && "stroke-[2.4]")} />
                {shortLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

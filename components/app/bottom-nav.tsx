"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { springGlide } from "@/lib/motion";
import { NAV_ITEMS, NO_GROUP_NAV_ITEMS, resolveNavItem } from "./nav-items";
import { navItemVariants } from "./nav-item-variants";
import { useActiveGroupId } from "@/lib/use-active-group";
import { useHasGroups } from "@/lib/use-has-groups";

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
  const items = hasGroups ? NAV_ITEMS : NO_GROUP_NAV_ITEMS;

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
          hasGroups ? "grid-cols-4" : "grid-cols-2",
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

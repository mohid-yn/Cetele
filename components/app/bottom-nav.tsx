"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { springGlide } from "@/lib/motion";
import { NAV_ITEMS, NO_GROUP_NAV_ITEMS, resolveNavItem } from "./nav-items";
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
      className="shrink-0 border-t border-border bg-card/95 shadow-up backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul
        className={cn(
          "mx-auto grid max-w-[28rem]",
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
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors duration-[var(--duration-fast)]",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.div
                    layoutId="bottom-nav-active"
                    transition={springGlide}
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary"
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

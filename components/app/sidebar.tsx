"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { springGlide } from "@/lib/motion";
import { NAV_ITEMS, NO_GROUP_NAV_ITEMS, resolveNavItem } from "./nav-items";
import { navItemVariants } from "./nav-item-variants";
import { GroupSwitcher } from "@/components/app/group-switcher";
import { ThemeToggleButton } from "@/components/theme/theme-toggle";
import { WebAppLogo } from "@/components/ui/logo";
import { useActiveGroupId } from "@/lib/use-active-group";
import { useHasGroups } from "@/lib/use-has-groups";
import { groupHref } from "@/lib/group-href";

/** Persistent left nav for desktop (≥lg). Mirrors the mobile bottom bar. */
export function Sidebar({
  initialHasGroups,
  initialGroupId,
}: {
  initialHasGroups: boolean;
  initialGroupId: string | null;
}) {
  const pathname = usePathname();
  const groupId = useActiveGroupId(initialGroupId);
  const hasGroups = useHasGroups(initialHasGroups);
  const items = hasGroups ? NAV_ITEMS : NO_GROUP_NAV_ITEMS;

  return (
    // `bg-chrome` — same reason as the bottom nav: the sidebar is the frame.
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-chrome p-4 lg:flex">
      {/* Wordmark */}
      <Link
        href={groupId ? groupHref(groupId, "/today") : "/groups"}
        aria-label="Cetele — home"
        className="mb-6 flex items-center px-2"
      >
        <WebAppLogo className="h-8 w-auto" />
      </Link>

      {/* Active group (switcher when the user belongs to more than one). Hidden
          with no circle — there's nothing to switch between. */}
      {hasGroups && (
        <GroupSwitcher
          initialGroupId={initialGroupId}
          className="mb-2 w-full justify-between px-2 py-1.5 text-sm font-semibold"
        />
      )}

      {/* Nav */}
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {items.map((item) => {
          const { href, active } = resolveNavItem(item, pathname, groupId);
          const { label, Icon } = item;
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={navItemVariants({ layout: "row", active })}
            >
              {/* Same sliding pill as the bottom bar, same token — the two navs
                  are now one control wearing two layouts. The fill was
                  `bg-primary/10`: an alpha over chrome resolves to a different
                  colour in each theme, so it could never be measured once. */}
              {active && (
                <motion.span
                  aria-hidden
                  layoutId="sidebar-nav-active"
                  transition={springGlide}
                  className="absolute inset-0 -z-10 rounded-lg bg-primary-container"
                />
              )}
              <Icon className={cn("size-5", active && "stroke-[2.4]")} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Theme at the foot — a single icon button, not the labelled two-option
          pill this used to carry. Theme is a preference, and a 224px control
          spelling out both options is more furniture than a preference earns in
          the navigation frame. The full labelled control still lives on
          /profile, where every other preference is. */}
      <div className="mt-auto flex justify-start pt-4">
        <ThemeToggleButton />
      </div>
    </aside>
  );
}

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
  ADMIN_ZONE_EXIT,
  adminZoneItems,
  noGroupNavItems,
  resolveNavItem,
} from "./nav-items";
import { navItemVariants } from "./nav-item-variants";
import { GroupSwitcher } from "@/components/app/group-switcher";
import { ThemeToggleButton } from "@/components/theme/theme-toggle";
import { WebAppLogo } from "@/components/ui/logo";
import { Avatar, Button } from "@/components/ui";
import { SignOutIcon } from "./icons";
import { useActiveGroupId } from "@/lib/use-active-group";
import { useHasGroups } from "@/lib/use-has-groups";
import { useHasRoadmap } from "@/lib/groups-store";
import {
  useIsSteward,
  useIsSuperAdmin,
  useViewerIdentity,
} from "@/lib/viewer-store";
import { groupHref } from "@/lib/group-href";
import { isAdminZone } from "@/lib/admin-zone";

/** Persistent left nav for desktop (≥lg). Mirrors the mobile bottom bar. */
export function Sidebar({
  initialHasGroups,
  initialGroupId,
  initialIsOrganiser,
  initialHasRoadmap,
}: {
  initialHasGroups: boolean;
  initialGroupId: string | null;
  initialIsOrganiser: boolean;
  initialHasRoadmap: boolean;
}) {
  const pathname = usePathname();
  const groupId = useActiveGroupId(initialGroupId);
  const hasGroups = useHasGroups(initialHasGroups);
  // Must agree with the bottom bar, or one member has two navigations depending
  // on viewport width.
  const hasRoadmap = useHasRoadmap(initialHasRoadmap);
  // The flag is fetched client-side because the shell does no server work (§4).
  const isOrganiser = useIsSuperAdmin(initialIsOrganiser);
  // A branch admin in no circle has no switcher, so the bar carries Admin (D86).
  const runsBranch = useIsSteward();
  // …and the same collapse on the picker itself, where no circle is selected.
  const inAdmin = isAdminZone(pathname, isOrganiser);
  const identity = useViewerIdentity();
  const items = (
    inAdmin
      ? [...adminZoneItems(isOrganiser), ADMIN_ZONE_EXIT]
      : hasGroups && !isGroupPicker(pathname)
        ? navItemsWithRoadmap(hasRoadmap, isOrganiser)
        : noGroupNavItems(isOrganiser, hasRoadmap, hasGroups, runsBranch)
  )
    // Profile is the account row at the foot here, not a tab: the same
    // destination as the bottom bar's, housed where a desktop puts "you".
    .filter((i) => !("href" in i) || i.href !== "/profile");
  const onProfile = pathname === "/profile";

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
      {inAdmin ? (
        <p className="mb-2 px-2 py-1.5 text-sm font-semibold text-foreground">
          Administration
        </p>
      ) : (
        hasGroups && (
          <GroupSwitcher
            initialGroupId={initialGroupId}
            className="mb-2 w-full justify-between px-2 py-1.5 text-sm font-semibold"
          />
        )
      )}

      {/* Nav */}
      <nav
        aria-label={inAdmin ? "Administration" : "Primary"}
        className="flex flex-col gap-1"
      >
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

      {/* The account row: who is signed in (it IS the Profile link), with the
          two account-level actions beside it. The theme icon used to stand
          alone down here, an orphan control with nothing to belong to, and
          signing out took a trip to the bottom of /profile. */}
      <div className="mt-auto flex items-center gap-1 border-t border-border pt-3">
        <Link
          href="/profile"
          aria-current={onProfile ? "page" : undefined}
          className={cn(
            navItemVariants({ layout: "row", active: onProfile }),
            "min-w-0 flex-1 px-2 py-2",
          )}
        >
          {onProfile && (
            <motion.span
              aria-hidden
              layoutId="sidebar-nav-active"
              transition={springGlide}
              className="absolute inset-0 -z-10 rounded-lg bg-primary-container"
            />
          )}
          <Avatar
            aria-hidden
            size="sm"
            name={identity?.name || "Profile"}
            src={identity?.avatarUrl ?? undefined}
          />
          <span className="truncate">{identity?.name || "Profile"}</span>
        </Link>
        <ThemeToggleButton variant="ghost" />
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="icon-sm" title="Sign out">
            <SignOutIcon aria-hidden />
            <span className="sr-only">Sign out</span>
          </Button>
        </form>
      </div>
    </aside>
  );
}

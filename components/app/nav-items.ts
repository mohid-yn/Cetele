import {
  ArrowLeftIcon,
  FlagIcon,
  GridIcon,
  HomeIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
} from "./icons";
import { groupHref, groupSubPath, type GroupSubPath } from "@/lib/group-href";

/**
 * Primary navigation, shared by the mobile bottom bar and the desktop sidebar.
 * Four destinations, each with a single job: Today (personal), Group
 * (collective — folds in standings), Progress (reflection), Profile (you).
 * `label` and `shortLabel` are kept identical so the tab name never changes
 * between mobile and desktop.
 *
 * The first three are group-scoped (CET-25): their real URL is
 * `/g/[groupId]/<sub>`, so they carry a `sub` path and resolve against the
 * active group at render time. Profile is a plain top-level route.
 */
type NavIcon = typeof HomeIcon;
type ScopedItem = {
  sub: GroupSubPath;
  label: string;
  shortLabel: string;
  Icon: NavIcon;
};
type FlatItem = {
  href: string;
  label: string;
  shortLabel: string;
  Icon: NavIcon;
};

export const NAV_ITEMS: readonly (ScopedItem | FlatItem)[] = [
  { sub: "/today", label: "Today", shortLabel: "Today", Icon: HomeIcon },
  { sub: "/group", label: "Group", shortLabel: "Group", Icon: UsersIcon },
  {
    sub: "/progress",
    label: "Progress",
    shortLabel: "Progress",
    Icon: GridIcon,
  },
  { href: "/profile", label: "Profile", shortLabel: "Profile", Icon: UserIcon },
] as const;

/**
 * The Roadmap tab, inserted before Profile when ANY of the member's circles
 * follows a programme, whichever is selected (D75). Flat, because the screen is
 * the member's own: opening it leaves the selected circle alone. Kept out of
 * `NAV_ITEMS` because it is conditional, as most members follow no programme.
 */
export const ROADMAP_NAV_ITEM: FlatItem = {
  href: "/roadmap",
  label: "Roadmap",
  shortLabel: "Roadmap",
  Icon: FlagIcon,
};

/**
 * The organiser's door into the administration workspace.
 *
 * An organiser is deliberately in no circle (D27), so no group page can offer
 * this. It lands on the roadmap hub rather than a landing page of its own: that
 * is what an organiser comes for, and the workspace has its own tabs from there.
 */
export const ADMIN_NAV_ITEM: FlatItem = {
  href: "/programme",
  label: "Admin",
  shortLabel: "Admin",
  Icon: ShieldIcon,
};

/** The workspace's own tabs, which replace the member's nav inside it (D74). */
export const ADMIN_ZONE_ITEMS: readonly FlatItem[] = [
  {
    href: "/programme",
    label: "Roadmaps",
    shortLabel: "Roadmaps",
    Icon: FlagIcon,
  },
  {
    href: "/admin/organisers",
    label: "Organisers",
    shortLabel: "Organisers",
    Icon: UsersIcon,
  },
];

/**
 * The way out, named for where it goes. The picker rather than the last circle,
 * because an organiser may be in none and the picker is right for both.
 */
export const ADMIN_ZONE_EXIT: FlatItem = {
  href: "/groups",
  label: "Circles",
  shortLabel: "Circles",
  Icon: ArrowLeftIcon,
};

/**
 * NAV_ITEMS with the conditional fifth tab spliced in before Profile.
 *
 * NEVER BOTH, or an organiser who owns a circle following a programme gets a
 * six-tab bar. The circle's Roadmap wins, because it is where their own progress
 * is recorded. Admin stays reachable from Profile and from the circle picker.
 */
export function navItemsWithRoadmap(
  hasRoadmap: boolean,
  isOrganiser = false,
): readonly (ScopedItem | FlatItem)[] {
  const extra = hasRoadmap
    ? ROADMAP_NAV_ITEM
    : isOrganiser
      ? ADMIN_NAV_ITEM
      : null;
  if (!extra) return NAV_ITEMS;
  return [...NAV_ITEMS.slice(0, -1), extra, NAV_ITEMS.at(-1)!];
}

/**
 * Is the viewer standing on the circle PICKER — "no group selected"?
 *
 * The nav collapses here for the same reason it collapses for someone with no
 * circle at all: `/groups` is the screen whose entire job is to choose one, and
 * a bar of circle-scoped tabs on it is a claim that a choice has already been
 * made. Worse, the tabs are not even honest — they point at whatever circle was
 * last active, so the picker offers a way into a circle the member is in the
 * middle of navigating away from.
 *
 * Keyed on the ROUTE rather than on "is an active group resolved", because the
 * active-group cookie usually still holds the last circle while you are here —
 * so asking whether one is selected would answer "yes" on the very screen where
 * the member is saying otherwise.
 */
export function isGroupPicker(pathname: string): boolean {
  return pathname === "/groups" || pathname.startsWith("/groups/");
}

/**
 * The nav for someone with NO circle yet (a group-only app has nothing to show
 * on the group tabs). Collapses to the front door + you — Today/Group/Progress
 * would just be dead links to /groups otherwise.
 */
export const NO_GROUP_NAV_ITEMS: readonly FlatItem[] = [
  { href: "/groups", label: "Groups", shortLabel: "Groups", Icon: GridIcon },
  { href: "/profile", label: "Profile", shortLabel: "Profile", Icon: UserIcon },
] as const;

/**
 * The same front door for an organiser, who is in no circle BY ROLE rather than
 * by not having started one yet (D27) — so this is their permanent navigation,
 * not a temporary state they are expected to leave.
 */
export function noGroupNavItems(
  isOrganiser: boolean,
): readonly (ScopedItem | FlatItem)[] {
  if (!isOrganiser) return NO_GROUP_NAV_ITEMS;
  return [NO_GROUP_NAV_ITEMS[0], ADMIN_NAV_ITEM, NO_GROUP_NAV_ITEMS.at(-1)!];
}

/**
 * Resolve a nav item to a concrete href + active state for the current path.
 * Group-scoped items point at the active group (or /groups when there is none);
 * a scoped item is active when the current group sub-path matches.
 */
export function resolveNavItem(
  item: ScopedItem | FlatItem,
  pathname: string,
  groupId: string | null,
): { href: string; active: boolean } {
  if ("href" in item) {
    return {
      href: item.href,
      active: pathname === item.href || pathname.startsWith(item.href + "/"),
    };
  }
  const href = groupId ? groupHref(groupId, item.sub) : "/groups";
  const active =
    pathname.startsWith("/g/") && groupSubPath(pathname) === item.sub;
  return { href, active };
}

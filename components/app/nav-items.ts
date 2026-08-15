import { HomeIcon, GridIcon, UsersIcon, UserIcon, FlagIcon } from "./icons";
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
 * The Roadmap tab, inserted before Profile for a circle that FOLLOWS a
 * programme (D55, Q7 resolved). Kept out of `NAV_ITEMS` because it is the only
 * conditional destination in the app: most circles follow no programme, and a
 * permanent tab leading to "this circle isn't following a programme" is clutter
 * rather than navigation. `useGroupHasRoadmap` decides; the navs splice.
 */
export const ROADMAP_NAV_ITEM: ScopedItem = {
  sub: "/roadmap",
  label: "Roadmap",
  shortLabel: "Roadmap",
  Icon: FlagIcon,
};

/**
 * The SAME tab for an organiser, pointing at the programme hub instead of a
 * circle's copy of it (D59).
 *
 * An organiser is deliberately in no circle (D27), so every group-scoped route
 * is closed to them and the tab above can never appear — which left the one
 * screen they are the audience for reachable from a card on /groups and
 * nowhere else. It is a FlatItem for the same reason the report is not
 * group-scoped: a programme is one thing however many circles follow it (D55).
 */
export const PROGRAMME_NAV_ITEM: FlatItem = {
  href: "/programme",
  label: "Roadmap",
  shortLabel: "Roadmap",
  Icon: FlagIcon,
};

/**
 * NAV_ITEMS with Roadmap spliced in before Profile.
 *
 * NEVER TWICE, and that is the whole subtlety: an organiser who also owns a
 * circle that follows a programme (the ordinary case for the person who set
 * both up) would otherwise get two tabs called Roadmap and a six-tab bottom
 * bar. The circle's own copy wins when there is one — it is where their
 * progress is recorded — and the hub is one tap away from it, on the button
 * that screen now carries for anyone who administers the programme.
 */
export function navItemsWithRoadmap(
  hasRoadmap: boolean,
  isOrganiser = false,
): readonly (ScopedItem | FlatItem)[] {
  const roadmap = hasRoadmap
    ? ROADMAP_NAV_ITEM
    : isOrganiser
      ? PROGRAMME_NAV_ITEM
      : null;
  if (!roadmap) return NAV_ITEMS;
  return [...NAV_ITEMS.slice(0, -1), roadmap, NAV_ITEMS.at(-1)!];
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
  return [
    NO_GROUP_NAV_ITEMS[0],
    PROGRAMME_NAV_ITEM,
    NO_GROUP_NAV_ITEMS.at(-1)!,
  ];
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

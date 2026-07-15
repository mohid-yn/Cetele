import { HomeIcon, GridIcon, UsersIcon, UserIcon } from "./icons";
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
 * The nav for someone with NO circle yet (a group-only app has nothing to show
 * on the group tabs). Collapses to the front door + you — Today/Group/Progress
 * would just be dead links to /groups otherwise.
 */
export const NO_GROUP_NAV_ITEMS: readonly FlatItem[] = [
  { href: "/groups", label: "Groups", shortLabel: "Groups", Icon: GridIcon },
  { href: "/profile", label: "Profile", shortLabel: "Profile", Icon: UserIcon },
] as const;

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

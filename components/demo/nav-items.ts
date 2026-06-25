import { HomeIcon, GridIcon, UsersIcon, UserIcon } from "./icons";

/**
 * Primary navigation, shared by the mobile bottom bar and the desktop sidebar.
 * Four destinations, each with a single job: Today (personal), Group
 * (collective — folds in standings), Progress (reflection), Profile (you).
 * `label` and `shortLabel` are kept identical so the tab name never changes
 * between mobile and desktop.
 */
export const NAV_ITEMS = [
  { href: "/today", label: "Today", shortLabel: "Today", Icon: HomeIcon },
  { href: "/group", label: "Group", shortLabel: "Group", Icon: UsersIcon },
  {
    href: "/progress",
    label: "Progress",
    shortLabel: "Progress",
    Icon: GridIcon,
  },
  { href: "/profile", label: "Profile", shortLabel: "Profile", Icon: UserIcon },
] as const;

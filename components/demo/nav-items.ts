import { HomeIcon, TrophyIcon, UsersIcon, UserIcon } from "./icons";

/** Primary navigation, shared by the mobile bottom bar and the desktop sidebar. */
export const NAV_ITEMS = [
  { href: "/today", label: "Today", shortLabel: "Today", Icon: HomeIcon },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    shortLabel: "Board",
    Icon: TrophyIcon,
  },
  { href: "/group", label: "Group", shortLabel: "Group", Icon: UsersIcon },
  { href: "/profile", label: "Profile", shortLabel: "Profile", Icon: UserIcon },
] as const;

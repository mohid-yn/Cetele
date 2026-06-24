"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { HomeIcon, TrophyIcon, UsersIcon, UserIcon } from "./icons";

const TABS = [
  { href: "/today", label: "Today", Icon: HomeIcon },
  { href: "/leaderboard", label: "Board", Icon: TrophyIcon },
  { href: "/group", label: "Group", Icon: UsersIcon },
  { href: "/profile", label: "Profile", Icon: UserIcon },
] as const;

/** Mobile tab bar pinned to the bottom of the app column. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-[var(--z-sticky)] border-t border-border bg-card/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-[28rem] grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors duration-[var(--duration-fast)]",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-6", active && "stroke-[2.4]")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

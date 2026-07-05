"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { GroupSwitcher } from "./group-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { WebAppLogo } from "@/components/ui/logo";

/** Persistent left nav for desktop (≥lg). Mirrors the mobile bottom bar. */
export function Sidebar() {
  const pathname = usePathname();
  const items = NAV_ITEMS;

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card p-4 lg:flex">
      {/* Wordmark */}
      <Link
        href="/today"
        aria-label="Cetele — home"
        className="mb-6 flex items-center px-2"
      >
        <WebAppLogo className="h-8 w-auto" />
      </Link>

      {/* Active group (switcher when the user belongs to more than one) */}
      <GroupSwitcher className="mb-2 w-full justify-between px-2 py-1.5 text-sm font-semibold" />

      {/* Nav */}
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-5", active && "stroke-[2.4]")} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle at the foot */}
      <div className="mt-auto pt-4">
        <ThemeToggle className="w-full justify-between" />
      </div>
    </aside>
  );
}

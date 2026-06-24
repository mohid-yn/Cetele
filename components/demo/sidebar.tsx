"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { ShieldIcon } from "./icons";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useMock, sel } from "@/lib/mock/store";

/** Persistent left nav for desktop (≥lg). Mirrors the mobile bottom bar. */
export function Sidebar() {
  const pathname = usePathname();
  const { state } = useMock();
  const group = sel.activeGroup(state);
  const showAdmin = state.session.viewRole === "admin";

  const items = [
    ...NAV_ITEMS,
    ...(showAdmin
      ? [
          {
            href: "/admin",
            label: "Admin",
            shortLabel: "Admin",
            Icon: ShieldIcon,
          } as const,
        ]
      : []),
  ];

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card p-4 lg:flex">
      {/* Wordmark */}
      <Link href="/today" className="mb-6 flex items-center gap-2.5 px-2">
        <span
          aria-hidden
          className="size-7 rounded-full border-[5px] border-primary"
          style={{ borderTopColor: "transparent" }}
        />
        <span className="font-display text-xl font-bold tracking-tight text-primary">
          Cetele
        </span>
      </Link>

      {/* Active group */}
      <p className="mb-2 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {group.name}
      </p>

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

"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { springGlide } from "@/lib/motion";
import { ADMIN_ZONE_EXIT, adminZoneItems, resolveNavItem } from "./nav-items";
import { navItemVariants } from "./nav-item-variants";

/**
 * The phone's bottom bar inside the administration workspace (D74).
 *
 * It replaces the member's tabs rather than adding to them, and it is deep sage
 * rather than chrome, because this is a different place: nothing here is about
 * today's dhikr, and the bar should say so at a glance on any screen, including
 * a programme editor several levels down. Same height as the member's bar, so
 * the content does not move when it swaps.
 *
 * `pathname` is a prop so the design system page can render it standing still.
 */
// Literal class names, so Tailwind sees them: one column per tab plus the exit.
const COLS: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export function AdminTabBar({
  pathname,
  isOrganiser = true,
}: {
  pathname: string;
  /** A steward who is not an organiser gets Events and Branches only (D79). */
  isOrganiser?: boolean;
}) {
  const items = adminZoneItems(isOrganiser);
  return (
    <nav
      aria-label="Administration"
      className="shrink-0 border-t border-admin-chrome bg-admin-chrome lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul
        className={cn(
          "mx-auto grid max-w-[28rem] gap-1 p-1.5",
          COLS[items.length + 1],
        )}
      >
        {items.map((item) => {
          const { href, active } = resolveNavItem(item, pathname, null);
          const { shortLabel, Icon } = item;
          return (
            <li key={shortLabel}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={navItemVariants({
                  layout: "stack",
                  active,
                  tone: "admin",
                })}
              >
                <span className="relative isolate grid h-8 w-14 place-items-center">
                  {active && (
                    <motion.span
                      aria-hidden
                      layoutId="admin-nav-active"
                      transition={springGlide}
                      className="absolute inset-0 -z-10 rounded-full bg-admin-chrome-pill"
                    />
                  )}
                  <Icon
                    className={cn(
                      "size-6",
                      active && "stroke-[2.4] text-on-admin-chrome-pill",
                    )}
                  />
                </span>
                <span className={cn(active && "text-admin-chrome-foreground")}>
                  {shortLabel}
                </span>
              </Link>
            </li>
          );
        })}
        {/* The way out sits behind a rule, so it does not read as a third tab
            of the workspace. */}
        <li className="border-l border-admin-chrome-hover pl-1">
          <Link
            href={ADMIN_ZONE_EXIT.href}
            className={navItemVariants({
              layout: "stack",
              active: false,
              tone: "admin",
            })}
          >
            <span className="grid h-8 w-14 place-items-center">
              <ADMIN_ZONE_EXIT.Icon className="size-6" />
            </span>
            {ADMIN_ZONE_EXIT.shortLabel}
          </Link>
        </li>
      </ul>
    </nav>
  );
}

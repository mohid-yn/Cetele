"use client";

import { usePathname } from "next/navigation";
import { groupIdFromPath, ACTIVE_GROUP_COOKIE } from "@/lib/group-href";

/** Read a non-httpOnly cookie in the browser. */
function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(name + "="))
    ?.split("=")[1];
}

/**
 * The active group id for building nav hrefs (CET-25). Prefers the id in the
 * URL (`/g/[groupId]/…`); on group-independent screens (/groups, /profile)
 * falls back to the last-visited cookie the proxy records. Null when the user
 * has no group context yet — nav then points at /groups.
 */
export function useActiveGroupId(): string | null {
  const pathname = usePathname();
  return groupIdFromPath(pathname) ?? readCookie(ACTIVE_GROUP_COOKIE) ?? null;
}

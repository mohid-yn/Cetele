"use client";

import * as React from "react";
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

// The cookie only changes on a navigation (switch / join / leave), which already
// re-renders via `usePathname` — so the external store needs no real subscription.
const noopSubscribe = () => () => {};

/**
 * The active group id for building nav hrefs (CET-25). Prefers the id in the
 * URL (`/g/[groupId]/…`); on group-independent screens (/groups, /profile)
 * falls back to the last-visited cookie. Null when the user has no group context
 * yet — nav then points at /groups.
 *
 * `serverGroupId` is that same cookie read on the server (there's no `document`
 * during SSR). SSR and the first client render use it so they agree — otherwise
 * the cookie-derived hrefs mismatch and React warns. AFTER mount we switch to
 * the live cookie, so a client-side group switch → group-independent screen
 * resolves to the just-chosen circle rather than the stale server value (757548c).
 */
export function useActiveGroupId(
  serverGroupId: string | null = null,
): string | null {
  const pathname = usePathname();
  // getServerSnapshot (SSR + hydration) → the server cookie value so the two
  // renders agree; getSnapshot (after hydration) → the live browser cookie.
  const cookieId = React.useSyncExternalStore(
    noopSubscribe,
    () => readCookie(ACTIVE_GROUP_COOKIE) ?? null,
    () => serverGroupId,
  );
  return groupIdFromPath(pathname) ?? cookieId;
}

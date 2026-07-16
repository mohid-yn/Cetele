"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { groupIdFromPath } from "@/lib/group-href";
import { refreshGroups, useGroupsSnapshot } from "@/lib/groups-store";

/**
 * Does the user have a circle to show the group tabs for? True immediately when
 * the URL is already a group page (no need to wait on the fetch), otherwise from
 * the groups store. Re-counts on navigation so create / delete / leave stay
 * accurate. Drives the nav's full-vs-front-door state.
 *
 * `initialHasGroups` is a server-rendered hint (the active-group cookie, read in
 * the app shell) so the FIRST paint is already right — pristine "no circle"
 * front door for a brand-new/just-left user, full nav with no flash for a
 * returning member — instead of guessing until the client count resolves. SSR
 * and the first client render both use it, so there's no hydration mismatch; the
 * store then confirms/corrects it after mount.
 */
export function useHasGroups(initialHasGroups: boolean): boolean {
  const pathname = usePathname();
  const { hasGroups, loaded } = useGroupsSnapshot();
  const onGroupPage = groupIdFromPath(pathname) !== null;

  React.useEffect(() => {
    // On a group page the URL already proves membership, and useHasGroups would
    // discard the count anyway — so skip the needless head-count query there and
    // only re-count on the group-independent screens that actually depend on it.
    if (!onGroupPage) void refreshGroups();
  }, [pathname, onGroupPage]);

  // The URL is proof. Otherwise trust the server hint until the first client
  // count returns (`loaded`), then the authoritative store value.
  if (onGroupPage) return true;
  return loaded ? hasGroups : initialHasGroups;
}

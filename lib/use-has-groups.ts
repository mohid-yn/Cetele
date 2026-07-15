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
 */
export function useHasGroups(): boolean {
  const pathname = usePathname();
  const { hasGroups } = useGroupsSnapshot();

  React.useEffect(() => {
    void refreshGroups();
  }, [pathname]);

  return groupIdFromPath(pathname) !== null || hasGroups;
}

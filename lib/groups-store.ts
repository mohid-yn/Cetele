"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/db-log";

/**
 * The signed-in user's circles — ONE source of truth for every shell surface:
 * the nav's full-vs-front-door choice (`useHasGroups`) AND the group switcher's
 * menu. It used to be just a head-count while the switcher kept its own
 * fetched-once-on-mount copy — but the shell survives client-side navigation,
 * so creating a second circle left the switcher's stale list missing it (and
 * the trigger stuck on "Select group": the cookie pointed at a circle the stale
 * list couldn't name). Holding the full list here, re-fetched on navigation,
 * keeps every consumer honest for the same price as one small indexed query.
 *
 * A module-level external store (not a context provider) ON PURPOSE: the nav
 * lives in the app shell alongside the page, and wrapping the RSC page in a
 * client provider fought with the motion page-transition template and
 * double-mounted the page. A store lets the shell components share one fetched
 * value without wrapping anything.
 */
export type GroupRow = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
};

type State = { groups: GroupRow[]; loaded: boolean };

const ROLE_RANK: Record<GroupRow["role"], number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

let state: State = { groups: [], loaded: false };
const listeners = new Set<() => void>();
let inFlight = false;
let queued = false;

/** One memberships fetch → publish to subscribers if the snapshot changed. */
async function fetchOnce(): Promise<void> {
  const supabase = createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;
  let groups: GroupRow[] = [];
  if (me) {
    const { data } = await q(
      "groups-store.memberships",
      supabase
        .from("memberships")
        .select("role, groups(id, name)")
        .eq("user_id", me),
    );
    groups = (data ?? [])
      .filter((r) => r.groups)
      .map((r) => ({
        id: r.groups!.id,
        name: r.groups!.name,
        role: r.role as GroupRow["role"],
      }))
      .sort(
        (a, b) =>
          ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name),
      );
  }
  const next: State = { groups, loaded: true };
  // Only swap the snapshot when something actually changed —
  // useSyncExternalStore consumers re-render on identity.
  if (JSON.stringify(next) !== JSON.stringify(state)) {
    state = next;
    listeners.forEach((l) => l());
  }
}

/**
 * Re-fetch the user's circles and notify subscribers.
 *
 * Navigation is the only refresh signal today (`useHasGroups` + the switcher) —
 * every create / delete / leave flow navigates, so a membership change WITHOUT
 * a route change would go unseen until the next navigation. Fine for now; noted
 * so a future in-place mutation adds an explicit `refreshGroups()`.
 *
 * A call that lands mid-flight doesn't drop: it sets `queued` so the LATEST
 * request always wins. A plain in-flight bail let an older, pre-mutation fetch
 * (e.g. the one a group page fired on mount, before you left it) overwrite the
 * fresh fetch the redirect to /groups triggered.
 */
export async function refreshGroups(): Promise<void> {
  if (inFlight) {
    queued = true;
    return;
  }
  inFlight = true;
  try {
    do {
      queued = false;
      await fetchOnce();
    } while (queued);
  } finally {
    inFlight = false;
  }
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useGroupsSnapshot(): State {
  return React.useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

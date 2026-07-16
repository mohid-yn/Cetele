"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Whether the signed-in user belongs to any circle — the signal the nav uses to
 * choose between the full app and the "no circle" front door.
 *
 * A module-level external store (not a context provider) ON PURPOSE: the nav
 * lives in the app shell alongside the page, and wrapping the RSC page in a
 * client provider fought with the motion page-transition template and
 * double-mounted the page. A store lets the two nav components (bottom bar +
 * sidebar) share one fetched value without wrapping anything.
 */
type State = { hasGroups: boolean; loaded: boolean };

let state: State = { hasGroups: false, loaded: false };
const listeners = new Set<() => void>();
let inFlight = false;
let queued = false;

/** One membership head-count → publish to subscribers if the snapshot changed. */
async function countOnce(): Promise<void> {
  const supabase = createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;
  let has = false;
  if (me) {
    const { count } = await supabase
      .from("memberships")
      .select("group_id", { count: "exact", head: true })
      .eq("user_id", me);
    has = (count ?? 0) > 0;
  }
  const next: State = { hasGroups: has, loaded: true };
  if (next.hasGroups !== state.hasGroups || next.loaded !== state.loaded) {
    state = next;
    listeners.forEach((l) => l());
  }
}

/**
 * Re-count the user's memberships (cheap head count) and notify subscribers.
 *
 * Navigation is the only refresh signal today (see `useHasGroups`) — every
 * create / delete / leave flow navigates, so a membership change WITHOUT a route
 * change would go unseen until the next navigation. Fine for now; noted so a
 * future in-place mutation adds an explicit `refreshGroups()`.
 *
 * A call that lands mid-flight doesn't drop: it sets `queued` so the LATEST
 * request always wins. A plain in-flight bail let an older, pre-mutation count
 * (e.g. the one a group page fired on mount, before you left it) overwrite the
 * fresh count the redirect to /groups triggered — leaving the front door showing
 * the full nav.
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
      await countOnce();
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

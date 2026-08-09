"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/db-log";

/**
 * Is the signed-in person an organiser? — for the nav's permanent Roadmap tab.
 *
 * WHY A CLIENT STORE. An organiser is deliberately in NO circle (D27), so the
 * only surface that can carry them to the programme is the app shell's nav —
 * and the shell **does no auth and no DB work on the server** (§4: mounting
 * per-request auth in `app/(app)/layout.tsx` once took e2e from 15/15 to 7/15,
 * because it wraps every request in the app). The way round that is the one
 * `groups-store` already uses: fetch it in the CLIENT, once, and let every nav
 * surface read the same module-level snapshot.
 *
 * NOT folded into `groups-store`, which answers a different question and is
 * deliberately re-fetched on every navigation for the switcher's menu. This
 * flag is a property of the person, not of their memberships.
 *
 * ONE QUERY PER PAGE LOAD, and no longer-lived cache than that. A
 * `sessionStorage` memory was written and taken back out: it would have made a
 * reload free, but it caches the NEGATIVE too, and "you are not an organiser"
 * is exactly the answer that goes stale the moment somebody appoints you (D56).
 * The tab would then not arrive until the tab itself was closed — for a saving
 * of one indexed single-row read, fired after mount, in parallel with the
 * screen's own work. Client navigations already cost nothing: the module
 * snapshot survives them, so this runs once per document, not once per screen.
 *
 * The snapshot starts `false`, so SSR and the first client render agree and the
 * tab simply arrives when the answer does. It never flashes AWAY: nothing here
 * ever goes true → false within a load.
 */
type State = { isSuperAdmin: boolean; loaded: boolean };

let state: State = { isSuperAdmin: false, loaded: false };
const listeners = new Set<() => void>();
let inFlight = false;

function publish(isSuperAdmin: boolean): void {
  const next: State = { isSuperAdmin, loaded: true };
  if (next.isSuperAdmin !== state.isSuperAdmin || !state.loaded) {
    state = next;
    listeners.forEach((l) => l());
  }
}

async function fetchOnce(): Promise<void> {
  const supabase = createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;
  if (!me) {
    publish(false);
    return;
  }

  // Read off `profiles` rather than `private.is_super_admin()` — the private
  // schema is not exposed to PostgREST (0002), and the self arm of
  // `profiles_select_self_or_shared` covers your own row. Exactly how the
  // report and the catalogue read it server-side.
  const { data } = await q(
    "viewer-store.is_super_admin",
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", me)
      .maybeSingle(),
  );
  publish(data?.is_super_admin ?? false);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/**
 * Whether the viewer is an organiser. Triggers the one fetch on first mount;
 * every later caller and every client navigation reads the cached snapshot.
 */
export function useIsSuperAdmin(): boolean {
  const snapshot = React.useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

  React.useEffect(() => {
    if (state.loaded || inFlight) return;
    inFlight = true;
    void fetchOnce().finally(() => {
      inFlight = false;
    });
  }, []);

  return snapshot.isSuperAdmin;
}

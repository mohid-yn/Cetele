"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/db-log";
import { ORGANISER_HINT_COOKIE } from "@/lib/admin-zone";

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
 * THE COOKIE IS NOT THAT CACHE. It remembers only the positive, as a first-paint
 * hint (`ORGANISER_HINT_COOKIE`), and this read overwrites it on every load. So a
 * new appointee's tab still arrives with the answer, and someone stood down
 * elsewhere sees the old tabs for one read at most, then never again.
 */
/** A branch the viewer is an admin of (D79), for the switcher's "You run" (D86). */
export type RunPlace = { id: string; name: string };

type State = {
  isSuperAdmin: boolean;
  isSteward: boolean;
  runs: RunPlace[];
  loaded: boolean;
};

let state: State = {
  isSuperAdmin: false,
  isSteward: false,
  runs: [],
  loaded: false,
};
const listeners = new Set<() => void>();
let inFlight = false;

function writeHint(isSuperAdmin: boolean): void {
  document.cookie = isSuperAdmin
    ? `${ORGANISER_HINT_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    : `${ORGANISER_HINT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

function publish(isSuperAdmin: boolean, runs: RunPlace[] = []): void {
  writeHint(isSuperAdmin);
  const next: State = {
    isSuperAdmin,
    isSteward: runs.length > 0,
    runs,
    loaded: true,
  };
  if (
    next.isSuperAdmin !== state.isSuperAdmin ||
    next.runs.map((r) => r.id).join() !== state.runs.map((r) => r.id).join() ||
    !state.loaded
  ) {
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
  //
  // A steward (D79) runs a branch without the organiser role. The self arm of
  // `branch_stewards_select` returns their own rows; one is enough.
  const [{ data }, { data: stewardRows }] = await Promise.all([
    q(
      "viewer-store.is_super_admin",
      supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", me)
        .maybeSingle(),
    ),
    q(
      "viewer-store.is_steward",
      supabase
        .from("branch_stewards")
        .select("branch_id, branches(name, archived_at)")
        .eq("user_id", me),
    ),
  ]);
  publish(
    data?.is_super_admin ?? false,
    (stewardRows ?? [])
      // An archived branch (D87) is not somewhere to go in the switcher.
      .filter((r) => !r.branches?.archived_at)
      .map((r) => ({ id: r.branch_id, name: r.branches?.name ?? "Branch" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
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
 *
 * `initial` is the server's reading of the hint cookie, and stands in until the
 * read comes back. Server and first client render both use it, so they agree.
 */
export function useIsSuperAdmin(initial = false): boolean {
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

  return snapshot.loaded ? snapshot.isSuperAdmin : initial;
}

/**
 * Does the viewer run a branch (D79)? Organisers run every branch, so this is
 * true for them too. Shares the one fetch with `useIsSuperAdmin`.
 */
export function useIsSteward(initial = false): boolean {
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
  return snapshot.loaded
    ? snapshot.isSteward || snapshot.isSuperAdmin
    : initial;
}

/**
 * The branches the viewer runs (D86), for the circle switcher's "You run"
 * section. Empty until loaded and for anyone who runs none. An organiser runs
 * every branch without a row, so the switcher shows them "All branches" from
 * `useIsSuperAdmin` instead.
 */
export function useBranchesIRun(): RunPlace[] {
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
  return snapshot.runs;
}

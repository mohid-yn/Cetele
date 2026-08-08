"use client";

import * as React from "react";

/**
 * Does the circle you are looking at follow a programme? — for the nav only.
 *
 * WHY A STORE AND NOT A QUERY. The Roadmap tab is CONDITIONAL: most circles
 * follow no programme (D55), and a tab that leads to "this circle isn't
 * following a programme" on every circle in the app is clutter, not
 * navigation. So the nav needs a per-group database fact — and the nav lives in
 * the app shell, which **deliberately does no auth and no DB work**: mounting
 * per-request auth there once took the e2e suite from 15/15 to 7/15, because
 * the shell wraps every request in the app (`app/(app)/layout.tsx`).
 *
 * The way round it is the one the active-group cookie already uses: let a
 * screen that is ALREADY doing the work tell the nav. `/g/[groupId]/layout.tsx`
 * runs only on group routes, re-renders only when the groupId segment changes,
 * and is a server component with the id in hand — so it reads the flag once per
 * circle and publishes it here. The shell stays inert.
 *
 * A MODULE-LEVEL STORE, not context, for the same reason `groups-store` is one:
 * the publisher is INSIDE the tree the nav wraps, so it cannot pass a prop or a
 * provider upward. `useSyncExternalStore` keeps SSR and the first client render
 * agreeing (the server snapshot is always `null` — "not known yet" — so the tab
 * is simply absent until a group page says otherwise, which never flashes a tab
 * away that the user might already be reaching for).
 */
type State = { groupId: string; hasRoadmap: boolean } | null;

let state: State = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
// Never the client value: the shell has no way to know this at SSR time, and
// returning anything else here is a hydration mismatch by construction.
const getServerSnapshot = (): State => null;

/** Publish the active circle's programme flag. Called by the group layout. */
export function setGroupRoadmap(groupId: string, hasRoadmap: boolean): void {
  if (state?.groupId === groupId && state.hasRoadmap === hasRoadmap) return;
  state = { groupId, hasRoadmap };
  emit();
}

/**
 * Whether to show the Roadmap tab for `groupId`.
 *
 * Answers false for a DIFFERENT circle's id — while a navigation between two
 * circles is in flight the store still holds the old one, and inheriting the
 * previous circle's answer is how a tab appears on a circle that has no
 * programme. Unknown and no are the same thing to the nav; only a positive
 * match for the circle in hand shows the tab.
 */
export function useGroupHasRoadmap(groupId: string | null): boolean {
  const snapshot = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  if (!groupId || !snapshot) return false;
  return snapshot.groupId === groupId && snapshot.hasRoadmap;
}

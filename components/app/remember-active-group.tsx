"use client";

import * as React from "react";
import { ACTIVE_GROUP_COOKIE } from "@/lib/group-href";

/** Write the last-visited-group cookie now (client-side). Shared by the mount
 *  effect below and the switcher, so clicking a circle records it immediately —
 *  before the navigation even completes — not only once the target page mounts. */
export function writeActiveGroupCookie(groupId: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ACTIVE_GROUP_COOKIE}=${groupId}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

/**
 * Records the last-visited group in the `cetele-active-group` cookie — the
 * signal `resolveActiveGroup` uses for /profile and the bare /today|/group|
 * /progress redirects (CET-25 / D26).
 *
 * Set CLIENT-SIDE, on mount, deliberately: it used to live in the proxy
 * middleware, but Next 16 gives middleware no way to distinguish a real
 * navigation from a PREFETCH, and the switcher + /groups cards prefetch every
 * circle's route — so an off-screen prefetch silently rewrote the active group.
 * A mount effect only runs for a page the user actually landed on, never a
 * prefetch, so this can't be clobbered. Keyed on groupId, so switching circles
 * updates it. It's a plain (non-httpOnly) cookie — the server only reads it as a
 * hint and always re-validates against real memberships.
 */
export function RememberActiveGroup({ groupId }: { groupId: string }) {
  React.useEffect(() => {
    writeActiveGroupCookie(groupId);
  }, [groupId]);
  return null;
}

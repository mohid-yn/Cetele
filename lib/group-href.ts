/**
 * Path-based group routing (CET-25). The active group lives in the URL
 * (`/g/[groupId]/…`) rather than a cookie, so Next can prefetch each group's
 * screens and groups get shareable URLs. These helpers build and read those
 * paths in one place.
 */

/**
 * The last-visited group cookie. Lives here (a pure, import-safe module) rather
 * than in the server-only active-group.ts so client code — the nav's
 * useActiveGroupId — can read the name without dragging `next/headers` into the
 * browser bundle.
 */
export const ACTIVE_GROUP_COOKIE = "cetele-active-group";

/** The group-scoped screens, as URL sub-paths under `/g/[groupId]`. */
export type GroupSubPath =
  | "/today"
  | "/group"
  | "/group/manage"
  | "/progress"
  | `/count/${string}`;

/** Build a group-scoped URL, e.g. groupHref(id, "/today") → /g/<id>/today. */
export function groupHref(groupId: string, sub: GroupSubPath = "/today") {
  return `/g/${groupId}${sub}`;
}

/**
 * Extract the group id from a path like `/g/<id>/today`. Returns null when the
 * path isn't group-scoped (e.g. /groups, /profile). Shared by the nav and the
 * switcher so both resolve the active group from the URL, not a cookie.
 */
export function groupIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/g\/([^/]+)(?:\/|$)/);
  return m ? m[1] : null;
}

/**
 * The sub-path within a group route, e.g. `/g/<id>/group/manage` → "/group".
 * Used to keep the same tab when switching groups. Falls back to "/today".
 */
export function groupSubPath(pathname: string): GroupSubPath {
  const rest = pathname.replace(/^\/g\/[^/]+/, "");
  if (rest.startsWith("/group/manage")) return "/group/manage";
  if (rest.startsWith("/group")) return "/group";
  if (rest.startsWith("/progress")) return "/progress";
  return "/today";
}

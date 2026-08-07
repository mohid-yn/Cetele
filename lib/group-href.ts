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
  | "/roadmap"
  | `/count/${string}`;

/** Build a group-scoped URL, e.g. groupHref(id, "/today") → /g/<id>/today. */
export function groupHref(groupId: string, sub: GroupSubPath = "/today") {
  return `/g/${groupId}${sub}`;
}

/**
 * The group screens a write can change. Server Actions revalidate these
 * **concrete** paths (`/g/<id>/today`), never the route template
 * (`/g/[groupId]/today`): a template only busts the server's Full Route Cache,
 * which these dynamic pages don't use, and leaves the **client Router Cache**
 * holding the RSC payload the nav prefetched *before* the write. Navigating
 * back then replays that pre-write payload — the count-edit-then-reopen bug.
 */
export const GROUP_WRITE_PATHS: GroupSubPath[] = [
  "/today",
  "/group",
  "/progress",
];

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
 * Used to keep the same tab when switching groups, and by the nav to decide
 * which tab is lit.
 *
 * **Every group-scoped route must be listed here.** The fallback is "/today",
 * so an unlisted one does not merely go unrecognised — it silently claims to BE
 * Today, and the nav lights the Today tab while you are somewhere else. That is
 * how `/roadmap` shipped: the route was added and this function was not told,
 * so the roadmap screen highlighted Today. A route with no tab of its own
 * (`/group/manage`, `/roadmap`) still needs its own value, so that it matches
 * no nav item and nothing is lit — which is the honest state, not an omission.
 */
export function groupSubPath(pathname: string): GroupSubPath {
  const rest = pathname.replace(/^\/g\/[^/]+/, "");
  if (rest.startsWith("/group/manage")) return "/group/manage";
  if (rest.startsWith("/group")) return "/group";
  if (rest.startsWith("/progress")) return "/progress";
  if (rest.startsWith("/roadmap")) return "/roadmap";
  return "/today";
}

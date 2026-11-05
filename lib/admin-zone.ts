/**
 * A hint for the nav's first paint: this browser last read an organiser.
 *
 * The app shell does no auth or DB work (§4), so without this a full load of
 * /programme paints the member's tabs until the viewer store's read comes back.
 * It only chooses which tabs to draw. It grants nothing: every page and RPC asks
 * the database, and the viewer store corrects this on every load.
 */
export const ORGANISER_HINT_COOKIE = "cetele-organiser-hint";

/**
 * Is this screen part of the organiser's administration workspace?
 *
 * `/admin` belongs to organisers outright: its pages refuse anyone else on the
 * server, so the answer needs no viewer. `/programme` is shared, because a
 * circle's admin reads the hub and the cohort report there too (D69). For them
 * it is an ordinary screen in their circle's navigation, so it only counts for
 * an organiser.
 */
export function isAdminZone(pathname: string, isOrganiser: boolean): boolean {
  if (matches(pathname, "/admin")) return true;
  return isOrganiser && matches(pathname, "/programme");
}

function matches(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

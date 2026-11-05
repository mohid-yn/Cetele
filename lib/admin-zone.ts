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

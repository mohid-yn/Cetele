import { redirect } from "next/navigation";
import { resolveActiveGroup } from "@/lib/active-group";
import { groupHref } from "@/lib/group-href";

/**
 * Bare `/today` (CET-25) — the real screens live under `/g/[groupId]/today`.
 * Kept as a redirect to the last-visited / best group (or /groups when the
 * user has none) so bookmarks and stale links keep working.
 */
export default async function TodayRedirect() {
  const active = await resolveActiveGroup();
  redirect(active ? groupHref(active.groupId, "/today") : "/groups");
}

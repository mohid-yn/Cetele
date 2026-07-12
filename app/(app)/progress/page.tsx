import { redirect } from "next/navigation";
import { resolveActiveGroup } from "@/lib/active-group";
import { groupHref } from "@/lib/group-href";

/**
 * Bare `/progress` (CET-25) — redirects to the last-visited / best group's
 * progress (or /groups when the user has none). Real screen:
 * `/g/[groupId]/progress`.
 */
export default async function ProgressRedirect() {
  const active = await resolveActiveGroup();
  redirect(active ? groupHref(active.groupId, "/progress") : "/groups");
}

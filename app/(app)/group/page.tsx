import { redirect } from "next/navigation";
import { resolveActiveGroup } from "@/lib/active-group";
import { groupHref } from "@/lib/group-href";

/**
 * Bare `/group` (CET-25) — redirects to the last-visited / best group's hub
 * (or /groups when the user has none). Real screen: `/g/[groupId]/group`.
 */
export default async function GroupRedirect() {
  const active = await resolveActiveGroup();
  redirect(active ? groupHref(active.groupId, "/group") : "/groups");
}

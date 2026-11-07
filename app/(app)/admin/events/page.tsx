import { redirect } from "next/navigation";

/**
 * There is no events list in the workspace any more (D85): a camp or halaqah
 * lives inside the branch it was posted to. Old links land on Branches.
 */
export default function AdminEventsPage() {
  redirect("/admin/branches");
}

import { revalidatePath } from "next/cache";

/** The screens that read a circle's branch. */
export function refreshShell(groupId: string): void {
  revalidatePath(`/g/${groupId}/group/manage`);
  revalidatePath("/events");
}

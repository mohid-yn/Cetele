import { RememberActiveGroup } from "@/components/app/remember-active-group";

/**
 * Wraps every group-scoped screen (`/g/[groupId]/…`). Its only job is to record
 * the active group client-side (RememberActiveGroup) once a page here actually
 * mounts — so a prefetch of some other circle's route can't rewrite it (see the
 * proxy note). The layout persists across the sub-tabs and re-runs only when the
 * groupId segment changes.
 */
export default async function GroupScopedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return (
    <>
      <RememberActiveGroup groupId={groupId} />
      {children}
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { resolveGroup } from "@/lib/active-group";
import { ManageClient } from "./manage-client";

/**
 * Manage screen, server-first (M2 — the second real screen after /groups).
 * Fetches this group's members / tasks / invites under RLS and pushes all
 * interactivity to the client leaf (ManageClient → Server Actions). The group
 * comes from the `/g/[groupId]` route param (CET-25).
 */
export default async function ManageGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const active = await resolveGroup(groupId);
  if (!active) redirect("/groups");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string;

  const canManage = active.role === "owner" || active.role === "admin";
  if (!canManage) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="text-muted-foreground">
            Only the owner or a co-admin can manage this group.
          </p>
          <Link
            href="/groups"
            className={buttonVariants({
              variant: "outline",
              className: "mt-4",
            })}
          >
            Back to groups
          </Link>
        </div>
      </div>
    );
  }

  const [
    { data: group },
    { data: members },
    { data: tasks },
    { data: invites },
    { data: canClaim },
  ] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, created_by")
      .eq("id", active.groupId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, user_id, role, profiles(name, avatar_url)")
      .eq("group_id", active.groupId),
    supabase
      .from("tasks")
      .select("id, label, subtitle, target_count, frequency_days, sort_order")
      .eq("group_id", active.groupId)
      .order("sort_order"),
    supabase
      .from("invites")
      .select("id, email, code, created_at")
      .eq("group_id", active.groupId)
      .order("created_at"),
    // M7 (D27): a co-admin can claim the group if the owner is absent.
    supabase.rpc("can_claim_ownership", { p_group: active.groupId }),
  ]);

  if (!group) redirect("/groups");

  // 0022: the row with NO email is the circle's one open link — exactly one
  // exists, guaranteed by a partial unique index, so this `find` cannot be
  // ambiguous. Everything else is a one-off, email-locked, single-use invite.
  // `defaultCode` is null only for a circle whose backfill has not run, which
  // the Regenerate action repairs rather than reporting.
  const defaultCode =
    (invites ?? []).find((i) => i.email === null)?.code ?? null;
  const lockedInvites = (invites ?? [])
    .filter((i) => i.email !== null)
    .map(({ id, email, code }) => ({ id, email, code }));

  const roleRank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
  const memberRows = (members ?? [])
    .map((m) => ({
      userId: m.user_id,
      role: m.role as "owner" | "admin" | "member",
      name: m.profiles?.name ?? "Unknown",
      avatarUrl: m.profiles?.avatar_url ?? null,
    }))
    .sort(
      (a, b) =>
        (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9) ||
        a.name.localeCompare(b.name),
    );

  return (
    <ManageClient
      group={group}
      me={me}
      myRole={active.role}
      members={memberRows}
      tasks={tasks ?? []}
      defaultCode={defaultCode}
      invites={lockedInvites}
      canClaim={canClaim ?? false}
    />
  );
}

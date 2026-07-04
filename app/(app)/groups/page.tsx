import { Badge, Card, buttonVariants } from "@/components/ui";
import { PageHeader } from "@/components/demo/page-header";
import { SectionHeading } from "@/components/demo/section-heading";
import { UsersIcon } from "@/components/demo/icons";
import { createClient } from "@/lib/supabase/server";
import { NewGroupButton } from "./new-group";
import { openManage } from "./actions";

/**
 * Groups home — the Drive-style "My Drive" for circles (D26). First screen
 * served from the real database (M1): your memberships, grouped by role.
 * Manage (M2) sets the active-group cookie and opens the real manage screen;
 * invite links live there (D34/D35 — per-invite codes, not a group code).
 */
export default async function GroupsHomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const me = data?.claims.sub;

  const { data: rows } = await supabase
    .from("memberships")
    .select("role, groups(id, name, memberships(count))")
    .eq("user_id", me ?? "")
    .order("role");

  const mine = (rows ?? []).filter((r) => r.groups != null);
  const owned = mine.filter((r) => r.role === "owner");
  const shared = mine.filter((r) => r.role === "admin");
  const memberOf = mine.filter((r) => r.role === "member");

  const GroupCard = ({ row }: { row: (typeof mine)[number] }) => {
    const g = row.groups!;
    const members = g.memberships?.[0]?.count ?? 0;
    const canManage = row.role === "owner" || row.role === "admin";
    return (
      <Card className="flex items-center gap-3 p-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <UsersIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <span className="truncate">{g.name}</span>
            {row.role === "owner" && (
              <Badge variant="accent" size="sm">
                owner
              </Badge>
            )}
            {row.role === "admin" && (
              <Badge variant="primary" size="sm">
                co-admin
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {members} {members === 1 ? "member" : "members"}
          </p>
        </div>
        {canManage && (
          <form action={openManage.bind(null, g.id)}>
            <button
              type="submit"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Manage
            </button>
          </form>
        )}
      </Card>
    );
  };

  return (
    <div className="rise-in flex flex-col gap-6 px-4 pt-5 pb-6">
      <PageHeader
        title="Groups"
        subtitle="Circles you own or help run"
        action={<NewGroupButton />}
      />

      <section>
        <SectionHeading>My groups ({owned.length})</SectionHeading>
        {owned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            You don&rsquo;t own any groups yet — create one to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {owned.map((r) => (
              <li key={r.groups!.id}>
                <GroupCard row={r} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {shared.length > 0 && (
        <section>
          <SectionHeading>Shared with me ({shared.length})</SectionHeading>
          <ul className="flex flex-col gap-2">
            {shared.map((r) => (
              <li key={r.groups!.id}>
                <GroupCard row={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {memberOf.length > 0 && (
        <section>
          <SectionHeading>Member of ({memberOf.length})</SectionHeading>
          <ul className="flex flex-col gap-2">
            {memberOf.map((r) => (
              <li key={r.groups!.id}>
                <GroupCard row={r} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Dialog, Field, Input } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { PageHeader } from "@/components/demo/page-header";
import { SectionHeading } from "@/components/demo/section-heading";
import { PlusIcon, ChevronRightIcon, UsersIcon } from "@/components/demo/icons";
import type { Group } from "@/lib/mock/types";

/**
 * Groups home — the Drive-style "My Drive" for circles (D26). Replaces the old
 * app-level admin console: there is no global list, only *your* groups. Owned
 * groups sit under "My groups"; groups shared with you as a co-admin under
 * "Shared with me"; groups you simply belong to under "Member of".
 */
export default function GroupsHomePage() {
  const router = useRouter();
  const { state, actions } = useMock();
  const me = state.session.currentUserId;

  const owned = sel.myGroups(state, me);
  const shared = sel.sharedWithMe(state, me);
  const memberOf = sel.userGroups(state, me).filter((m) => m.role === "member");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");

  const open = (g: Group, manage: boolean) => {
    actions.setActiveGroup(g.id);
    router.push(manage ? "/group/manage" : "/group");
  };

  const create = () => {
    if (!newName.trim()) return;
    actions.createGroup(newName.trim());
    setNewName("");
    setCreateOpen(false);
    // createGroup makes the new group active — land in its manage screen.
    router.push("/group/manage");
  };

  const GroupCard = ({
    group,
    role,
  }: {
    group: Group;
    role: "owner" | "admin" | "member";
  }) => {
    const members = sel.groupMembers(state, group.id);
    const canManage = role === "owner" || role === "admin";
    return (
      <Card className="flex items-center gap-3 p-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <UsersIcon className="size-5" />
        </div>
        <button
          type="button"
          onClick={() => open(group, canManage)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <span className="truncate">{group.name}</span>
            {role === "owner" && (
              <Badge variant="accent" size="sm">
                owner
              </Badge>
            )}
            {role === "admin" && (
              <Badge variant="primary" size="sm">
                co-admin
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {members.length} members ·{" "}
            <span className="font-mono">{group.inviteCode}</span>
          </p>
        </button>
        <Button
          size="sm"
          variant={canManage ? "outline" : "ghost"}
          onClick={() => open(group, canManage)}
        >
          {canManage ? "Manage" : "Open"}
          <ChevronRightIcon className="size-4" />
        </Button>
      </Card>
    );
  };

  return (
    <div className="rise-in flex flex-col gap-6 px-4 pt-5 pb-6">
      <PageHeader
        title="Groups"
        subtitle="Circles you own or help run"
        action={
          <Button
            size="sm"
            variant="accent"
            leadingIcon={<PlusIcon />}
            onClick={() => setCreateOpen(true)}
          >
            New group
          </Button>
        }
      />

      <section>
        <SectionHeading>My groups ({owned.length})</SectionHeading>
        {owned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            You don&rsquo;t own any groups yet — create one to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {owned.map((m) => (
              <li key={m.groupId}>
                <GroupCard group={m.group} role="owner" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {shared.length > 0 && (
        <section>
          <SectionHeading>Shared with me ({shared.length})</SectionHeading>
          <ul className="flex flex-col gap-2">
            {shared.map((m) => (
              <li key={m.groupId}>
                <GroupCard group={m.group} role="admin" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {memberOf.length > 0 && (
        <section>
          <SectionHeading>Member of ({memberOf.length})</SectionHeading>
          <ul className="flex flex-col gap-2">
            {memberOf.map((m) => (
              <li key={m.groupId}>
                <GroupCard group={m.group} role="member" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New group"
        description="You'll be the owner — you can share it with co-admins afterwards."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!newName.trim()}
              onClick={create}
            >
              Create group
            </Button>
          </>
        }
      >
        <Field label="Group name" htmlFor="new-group-name" required>
          <Input
            id="new-group-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Isha Circle"
            autoFocus
          />
        </Field>
      </Dialog>
    </div>
  );
}

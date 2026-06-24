"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Stat,
  Field,
  Input,
  Dialog,
  ConfirmDialog,
} from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { isoDate } from "@/lib/mock/data";
import { ShieldIcon, PlusIcon } from "@/components/demo/icons";
import { RoleToggle, selectCls } from "@/components/demo/role-toggle";

/** Person-centric management: roles + memberships for one user across all groups. */
function PersonDialog({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const { state, actions } = useMock();
  const user = sel.user(state, userId);
  const [addGroupId, setAddGroupId] = React.useState("");

  if (!user) return null;
  const memberships = sel.userGroups(state, userId);
  const otherGroups = state.groups.filter(
    (g) => !memberships.some((m) => m.groupId === g.id),
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={user.name}
      description="Manage roles & group membership"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* App-level admin */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">App admin</p>
            <p className="text-xs text-muted-foreground">
              Full access to every group
            </p>
          </div>
          <Button
            size="sm"
            variant={user.isAdmin ? "primary" : "outline"}
            aria-pressed={user.isAdmin}
            onClick={() => actions.setAppAdmin(user.id, !user.isAdmin)}
          >
            {user.isAdmin ? "Granted" : "Grant"}
          </Button>
        </div>

        {/* Group memberships */}
        <div>
          <p className="mb-1.5 text-sm font-semibold text-foreground">
            Groups ({memberships.length})
          </p>
          {memberships.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Not a member of any group yet.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {memberships.map((m) => (
              <li
                key={m.groupId}
                className="flex items-center justify-between gap-2 rounded-xl border border-border p-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {m.group.name}
                </span>
                <RoleToggle
                  value={m.role}
                  onChange={(r) => actions.setMemberRole(user.id, m.groupId, r)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:bg-danger-500/10"
                  onClick={() => actions.removeMember(user.id, m.groupId)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>

        {/* Add to a group */}
        {otherGroups.length > 0 && (
          <div className="flex items-end gap-2">
            <Field
              label="Add to a group"
              htmlFor="add-group"
              className="flex-1"
            >
              <select
                id="add-group"
                className={selectCls}
                value={addGroupId}
                onChange={(e) => setAddGroupId(e.target.value)}
              >
                <option value="">Choose a group…</option>
                {otherGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              variant="primary"
              disabled={!addGroupId}
              onClick={() => {
                if (!addGroupId) return;
                actions.addUserToGroup(user.id, addGroupId, "member");
                setAddGroupId("");
              }}
            >
              Add
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { state, actions } = useMock();
  const isAdmin = state.session.viewRole === "admin";

  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newAdminId, setNewAdminId] = React.useState("");
  const [managingUserId, setManagingUserId] = React.useState<string | null>(
    null,
  );
  const [deletingGroupId, setDeletingGroupId] = React.useState<string | null>(
    null,
  );

  if (!isAdmin) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="text-muted-foreground">
            Switch to <strong>App admin</strong> in Demo Controls to open the
            console.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => router.push("/today")}
          >
            Back to today
          </Button>
        </div>
      </div>
    );
  }

  const today = isoDate(0);
  const countsToday = state.logs
    .filter((l) => l.date === today)
    .reduce((s, l) => s + l.count, 0);
  const appAdmins = state.users.filter((u) => u.isAdmin).length;
  const deletingGroup = state.groups.find((g) => g.id === deletingGroupId);

  const createGroup = () => {
    if (!newName.trim()) return;
    actions.createGroup(newName.trim(), newAdminId || undefined);
    setNewName("");
    setNewAdminId("");
    setCreateOpen(false);
  };

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-6">
      <header className="flex items-center gap-2">
        <div className="grid size-9 place-items-center rounded-full bg-accent-100 text-accent-700">
          <ShieldIcon className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Admin console
          </h1>
          <p className="text-sm text-muted-foreground">App-level management</p>
        </div>
      </header>

      <Card className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
        <Stat label="Groups" value={state.groups.length} />
        <Stat label="People" value={state.users.length} />
        <Stat label="App admins" value={appAdmins} />
        <Stat label="Counts·today" value={countsToday.toLocaleString()} />
      </Card>

      {/* Groups ---------------------------------------------------------- */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Groups ({state.groups.length})
          </h2>
          <Button
            size="sm"
            variant="accent"
            leadingIcon={<PlusIcon />}
            onClick={() => setCreateOpen(true)}
          >
            New group
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {state.groups.map((g) => {
            const members = sel.groupMembers(state, g.id);
            const admins = members.filter((m) => m.role === "group_admin");
            const isActive = g.id === state.session.activeGroupId;
            return (
              <li key={g.id}>
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold text-foreground">
                        {g.name}
                        {isActive && (
                          <Badge variant="success" size="sm">
                            active
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {members.length} members · code{" "}
                        <span className="font-mono">{g.inviteCode}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          actions.setActiveGroup(g.id);
                          router.push("/group/manage");
                        }}
                      >
                        Manage
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:bg-danger-500/10"
                        onClick={() => setDeletingGroupId(g.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs text-muted-foreground">
                      Group admins:
                    </span>
                    {admins.map((a) => (
                      <span key={a.userId} className="flex items-center gap-1">
                        <Avatar
                          name={a.user.name}
                          size="sm"
                          className="size-6 text-[0.625rem]"
                        />
                        <span className="text-xs text-foreground">
                          {a.user.name.split(" ")[0]}
                        </span>
                      </span>
                    ))}
                    {admins.length === 0 && (
                      <span className="text-xs text-warning">
                        none — assign one
                      </span>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {/* People ---------------------------------------------------------- */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          People ({state.users.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {state.users.map((u) => {
            const groups = sel.userGroups(state, u.id);
            return (
              <li key={u.id}>
                <Card className="flex items-center gap-3 p-3">
                  <Avatar name={u.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {u.name}
                      {u.isAdmin && (
                        <Badge variant="accent" size="sm">
                          app admin
                        </Badge>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {groups.length === 0 && (
                        <span className="text-xs text-muted-foreground">
                          no groups
                        </span>
                      )}
                      {groups.map((m) => (
                        <Badge
                          key={m.groupId}
                          variant={
                            m.role === "group_admin" ? "primary" : "neutral"
                          }
                          size="sm"
                        >
                          {m.group.name}
                          {m.role === "group_admin" && " · admin"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setManagingUserId(u.id)}
                  >
                    Manage
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Create-group dialog -------------------------------------------- */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New group"
        description="Create a circle and (optionally) assign its first admin."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!newName.trim()}
              onClick={createGroup}
            >
              Create group
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Group name" htmlFor="new-group-name" required>
            <Input
              id="new-group-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Isha Circle"
              autoFocus
            />
          </Field>
          <Field
            label="First group admin"
            htmlFor="new-group-admin"
            hint="Who runs this group. You can change this later."
          >
            <select
              id="new-group-admin"
              className={selectCls}
              value={newAdminId}
              onChange={(e) => setNewAdminId(e.target.value)}
            >
              <option value="">— none for now —</option>
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Dialog>

      {/* Person-management dialog ---------------------------------------- */}
      {managingUserId && (
        <PersonDialog
          userId={managingUserId}
          onClose={() => setManagingUserId(null)}
        />
      )}

      {/* Delete-group confirm ------------------------------------------- */}
      <ConfirmDialog
        open={!!deletingGroupId}
        onClose={() => setDeletingGroupId(null)}
        onConfirm={() =>
          deletingGroupId && actions.deleteGroup(deletingGroupId)
        }
        title={`Delete "${deletingGroup?.name ?? ""}"?`}
        description="This removes the group, its tasks, and all member records. This can't be undone."
        confirmLabel="Delete group"
      />
    </div>
  );
}

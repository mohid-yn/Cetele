"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  ConfirmDialog,
} from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { ArrowLeftIcon, PlusIcon, CheckIcon } from "@/components/demo/icons";
import { RoleToggle, selectCls } from "@/components/demo/role-toggle";
import { GroupSwitcher } from "@/components/demo/group-switcher";
import type { MemberRole, Task } from "@/lib/mock/types";

function TaskRow({
  task,
  onRemove,
}: {
  task: Task;
  onRemove: (task: Task) => void;
}) {
  const { actions } = useMock();
  const [editing, setEditing] = React.useState(false);
  const [label, setLabel] = React.useState(task.label);
  const [subtitle, setSubtitle] = React.useState(task.subtitle ?? "");
  const [target, setTarget] = React.useState(String(task.targetCount));

  const save = () => {
    actions.editTask(task.id, {
      label: label.trim() || task.label,
      subtitle: subtitle.trim() || undefined,
      targetCount: Math.max(1, parseInt(target, 10) || task.targetCount),
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label"
          />
          <Input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle (e.g. Arabic)"
            dir="auto"
          />
          <Input
            value={target}
            inputMode="numeric"
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))}
            placeholder="Daily target"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="accent"
              onClick={save}
              className="flex-1"
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{task.label}</p>
        {task.subtitle && (
          <p
            className="truncate text-sm text-muted-foreground"
            dir="rtl"
            lang="ar"
          >
            {task.subtitle}
          </p>
        )}
        <p className="text-xs text-muted-foreground tabular-nums">
          target {task.targetCount.toLocaleString()} / day
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-danger hover:bg-danger-500/10"
        onClick={() => onRemove(task)}
      >
        Remove
      </Button>
    </li>
  );
}

/** Read-only field with a copy button (invite link / code). */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
          {value}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <>
              <CheckIcon className="size-4" /> Copied
            </>
          ) : (
            "Copy"
          )}
        </Button>
      </div>
    </div>
  );
}

export default function ManageGroupPage() {
  const router = useRouter();
  const { state, actions } = useMock();
  const group = sel.activeGroup(state);
  const tasks = sel.groupTasks(state, group.id);
  const members = sel.groupMembers(state, group.id);
  const nonMembers = sel.nonMembers(state, group.id);
  const pendingInvites = sel.pendingInvitesFor(state, group.id);
  const me = state.session.currentUserId;
  const myRole = sel.membershipRole(state, me, group.id);
  const isOwner = myRole === "owner";
  const canManage = isOwner || myRole === "admin";

  const [newLabel, setNewLabel] = React.useState("");
  const [newSubtitle, setNewSubtitle] = React.useState("");
  const [newTarget, setNewTarget] = React.useState("100");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<MemberRole>("member");
  const [addExistingId, setAddExistingId] = React.useState("");
  const [addExistingRole, setAddExistingRole] =
    React.useState<MemberRole>("member");
  const [name, setName] = React.useState(group.name);
  const [transferId, setTransferId] = React.useState("");

  const [removingMember, setRemovingMember] = React.useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [removingTask, setRemovingTask] = React.useState<Task | null>(null);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  // Candidates ownership can pass to: any current member who isn't the owner.
  const transferCandidates = members.filter((m) => m.role !== "owner");
  const transferName = members.find((m) => m.userId === transferId)?.user.name;

  const addTask = () => {
    if (!newLabel.trim()) return;
    actions.addTask({
      groupId: group.id,
      label: newLabel.trim(),
      subtitle: newSubtitle.trim() || undefined,
      targetCount: Math.max(1, parseInt(newTarget, 10) || 100),
    });
    setNewLabel("");
    setNewSubtitle("");
    setNewTarget("100");
  };

  if (!canManage) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="text-muted-foreground">
            Only the owner or a co-admin can manage this group.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => router.push("/group")}
          >
            Back to group
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-4 pb-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeftIcon />}
          onClick={() => router.push("/group")}
        >
          Back
        </Button>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Manage
          </h1>
          <GroupSwitcher className="-ml-1 px-2 py-0.5 font-display text-2xl font-bold text-primary" />
        </div>
      </div>

      {/* Members --------------------------------------------------------- */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Members ({members.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const isSelf = m.userId === me;
            const isOwnerRow = m.role === "owner";
            return (
              <li
                key={m.userId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm"
              >
                <Avatar name={m.user.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    {m.user.name}
                    {isSelf && (
                      <span className="text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </p>
                  {isOwnerRow && (
                    <p className="text-xs text-muted-foreground">
                      Owner — change via Transfer ownership below
                    </p>
                  )}
                </div>
                {isOwnerRow ? (
                  <Badge variant="accent" size="sm">
                    owner
                  </Badge>
                ) : (
                  <>
                    <RoleToggle
                      value={m.role}
                      disabled={isSelf}
                      onChange={(r) =>
                        actions.setMemberRole(m.userId, group.id, r)
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-500/10 disabled:opacity-40"
                      disabled={isSelf}
                      onClick={() =>
                        setRemovingMember({
                          userId: m.userId,
                          name: m.user.name,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        {/* Pending email invites (D26 share-by-email) */}
        {pendingInvites.length > 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Pending invites ({pendingInvites.length})
            </p>
            <ul className="flex flex-col gap-1.5">
              {pendingInvites.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {i.email}
                  </span>
                  <Badge
                    variant={i.role === "admin" ? "primary" : "neutral"}
                    size="sm"
                  >
                    {i.role === "admin" ? "co-admin" : "member"}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {i.code}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Invite / share */}
        <Card className="mt-3 flex flex-col gap-4 p-4">
          <p className="text-sm font-semibold text-foreground">Add people</p>

          {/* Invite by email — choose participant or shared co-admin */}
          <Field label="Invite by email" htmlFor="invite-email">
            <div className="flex flex-wrap gap-2">
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                className="min-w-[12rem] flex-1"
              />
              <RoleToggle
                value={inviteRole}
                onChange={(r) => setInviteRole(r)}
              />
              <Button
                variant="primary"
                disabled={!inviteEmail.includes("@")}
                onClick={() => {
                  if (!inviteEmail.includes("@")) return;
                  actions.inviteByEmail(
                    group.id,
                    inviteEmail.trim(),
                    inviteRole === "admin" ? "admin" : "member",
                  );
                  setInviteEmail("");
                  setInviteRole("member");
                }}
              >
                Send invite
              </Button>
            </div>
          </Field>

          <CopyField
            label="Or share an invite link"
            value={`https://cetele.app/join/${group.inviteCode}`}
          />
          <CopyField label="Or invite code" value={group.inviteCode} />

          {nonMembers.length > 0 && (
            <div className="border-t border-border pt-3">
              <Field label="Add an existing person" htmlFor="add-existing">
                <div className="flex flex-wrap gap-2">
                  <select
                    id="add-existing"
                    className={selectCls + " min-w-[10rem] flex-1"}
                    value={addExistingId}
                    onChange={(e) => setAddExistingId(e.target.value)}
                  >
                    <option value="">Choose a person…</option>
                    {nonMembers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <RoleToggle
                    value={addExistingRole}
                    onChange={(r) => setAddExistingRole(r)}
                  />
                  <Button
                    variant="outline"
                    disabled={!addExistingId}
                    onClick={() => {
                      if (!addExistingId) return;
                      actions.addUserToGroup(
                        addExistingId,
                        group.id,
                        addExistingRole,
                      );
                      setAddExistingId("");
                      setAddExistingRole("member");
                    }}
                  >
                    Add
                  </Button>
                </div>
              </Field>
            </div>
          )}
        </Card>
      </section>

      {/* Tasks ----------------------------------------------------------- */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Tasks in {group.name}
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Every member follows this list. Targets are per person, per day.
        </p>
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onRemove={setRemovingTask} />
          ))}
          {tasks.length === 0 && (
            <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No tasks yet — add the group&rsquo;s first one below.
            </li>
          )}
        </ul>

        <Card className="mt-3 p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">
            Add a task
          </p>
          <div className="flex flex-col gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. La ilaha illallah)"
            />
            <Input
              value={newSubtitle}
              onChange={(e) => setNewSubtitle(e.target.value)}
              placeholder="Subtitle (optional)"
              dir="auto"
            />
            <Input
              value={newTarget}
              inputMode="numeric"
              onChange={(e) => setNewTarget(e.target.value.replace(/\D/g, ""))}
              placeholder="Daily target"
            />
            <Button
              variant="accent"
              leadingIcon={<PlusIcon />}
              disabled={!newLabel.trim()}
              onClick={addTask}
            >
              Add task
            </Button>
          </div>
        </Card>
      </section>

      {/* Settings -------------------------------------------------------- */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Settings</h2>
        <Card className="p-4">
          <Field label="Group name" htmlFor="group-name">
            <div className="flex gap-2">
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={!name.trim() || name.trim() === group.name}
                onClick={() => actions.renameGroup(group.id, name.trim())}
              >
                Save
              </Button>
            </div>
          </Field>
        </Card>
      </section>

      {/* Ownership ------------------------------------------------------- */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Ownership
        </h2>
        {isOwner ? (
          <Card className="flex flex-col gap-4 p-4">
            <Field
              label="Transfer ownership"
              htmlFor="transfer-owner"
              hint="The new owner gains full control; you become a co-admin."
            >
              <div className="flex flex-wrap gap-2">
                <select
                  id="transfer-owner"
                  className={selectCls + " min-w-[10rem] flex-1"}
                  value={transferId}
                  onChange={(e) => setTransferId(e.target.value)}
                  disabled={transferCandidates.length === 0}
                >
                  <option value="">
                    {transferCandidates.length
                      ? "Choose a member…"
                      : "No one to transfer to yet"}
                  </option>
                  {transferCandidates.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  disabled={!transferId}
                  onClick={() => setTransferOpen(true)}
                >
                  Transfer
                </Button>
              </div>
            </Field>

            <div className="border-t border-border pt-3">
              <p className="mb-1 text-sm font-medium text-danger">
                Delete this group
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Removes the group, its tasks, and all member records. This
                can&rsquo;t be undone.
              </p>
              <Button
                variant="ghost"
                className="text-danger hover:bg-danger-500/10"
                onClick={() => setDeleteOpen(true)}
              >
                Delete group
              </Button>
            </div>
          </Card>
        ) : sel.isOwnerDormant(state, group.id) ? (
          <Card className="flex flex-col gap-3 border-accent-500/40 bg-accent-500/10 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                This circle&rsquo;s owner has gone quiet
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {sel.groupOwner(state, group.id)?.name ?? "The owner"}{" "}
                hasn&rsquo;t been active here recently. As a co-admin you can
                take over so the circle keeps running — they stay on as a
                co-admin.
              </p>
            </div>
            <Button
              variant="accent"
              className="self-start"
              onClick={() => actions.claimOwnership(group.id)}
            >
              Claim ownership
            </Button>
          </Card>
        ) : (
          <Card className="p-4 text-sm text-muted-foreground">
            Owned by{" "}
            <span className="font-medium text-foreground">
              {sel.groupOwner(state, group.id)?.name ?? "—"}
            </span>
            . Only the owner can transfer or delete this group.
          </Card>
        )}
      </section>

      {/* Confirms -------------------------------------------------------- */}
      <ConfirmDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onConfirm={() => {
          if (transferId) actions.transferOwnership(group.id, transferId);
          setTransferId("");
        }}
        title={`Make ${transferName ?? "this member"} the owner?`}
        description="They gain full control of the group — including the ability to delete it. You'll stay on as a co-admin."
        confirmLabel="Transfer ownership"
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          actions.deleteGroup(group.id);
          router.push("/groups");
        }}
        title={`Delete "${group.name}"?`}
        description="This removes the group, its tasks, and all member records. This can't be undone."
        confirmLabel="Delete group"
      />
      <ConfirmDialog
        open={!!removingMember}
        onClose={() => setRemovingMember(null)}
        onConfirm={() =>
          removingMember &&
          actions.removeMember(removingMember.userId, group.id)
        }
        title={`Remove ${removingMember?.name ?? ""}?`}
        description="They lose access to this group. Their past history is kept and they can be re-added anytime."
        confirmLabel="Remove from group"
      />
      <ConfirmDialog
        open={!!removingTask}
        onClose={() => setRemovingTask(null)}
        onConfirm={() => removingTask && actions.removeTask(removingTask.id)}
        title={`Remove "${removingTask?.label ?? ""}"?`}
        description="This task and its logged counts are removed for everyone in the group."
        confirmLabel="Remove task"
      />
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  ConfirmDialog,
} from "@/components/ui";
import { ArrowLeftIcon, PlusIcon, CheckIcon } from "@/components/demo/icons";
import { RoleToggle, selectCls } from "@/components/demo/role-toggle";
import * as act from "./actions";

/**
 * Client leaf for the server-first manage screen (M2). All data arrives as
 * props from the Server Component; every mutation is a Server Action — RLS is
 * the authority, this layer only renders + confirms.
 */

type Role = "owner" | "admin" | "member";

export type ManageGroup = {
  id: string;
  name: string;
  created_by: string | null;
};
export type ManageMember = {
  userId: string;
  role: Role;
  name: string;
  avatarUrl: string | null;
};
export type ManageTask = {
  id: string;
  label: string;
  subtitle: string | null;
  target_count: number;
  sort_order: number;
};
export type ManageInvite = {
  id: string;
  email: string | null;
  role: "admin" | "member";
  code: string;
};

/** Run a Server Action inside a transition, surfacing its error. */
function useAction() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const run = (
    fn: () => Promise<{ error: string | null }>,
    after?: () => void,
  ) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else after?.();
    });
  };
  return { pending, error, run };
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-2 text-xs text-danger">
      {error}
    </p>
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

function TaskRow({
  task,
  onRemove,
}: {
  task: ManageTask;
  onRemove: (task: ManageTask) => void;
}) {
  const { pending, error, run } = useAction();
  const [editing, setEditing] = React.useState(false);
  const [label, setLabel] = React.useState(task.label);
  const [subtitle, setSubtitle] = React.useState(task.subtitle ?? "");
  const [target, setTarget] = React.useState(String(task.target_count));

  const save = () =>
    run(
      () => act.updateTask(task.id, { label, subtitle, target }),
      () => setEditing(false),
    );

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
              disabled={pending}
              className="flex-1"
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          <ErrorNote error={error} />
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
          target {task.target_count.toLocaleString()} / day
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

export function ManageClient({
  group,
  me,
  myRole,
  members,
  tasks,
  invites,
}: {
  group: ManageGroup;
  me: string;
  myRole: Role;
  members: ManageMember[];
  tasks: ManageTask[];
  invites: ManageInvite[];
}) {
  const isOwner = myRole === "owner";
  const owner = members.find((m) => m.role === "owner");

  const membersAct = useAction();
  const inviteAct = useAction();
  const taskAct = useAction();
  const settingsAct = useAction();
  const ownershipAct = useAction();

  const [newLabel, setNewLabel] = React.useState("");
  const [newSubtitle, setNewSubtitle] = React.useState("");
  const [newTarget, setNewTarget] = React.useState("100");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"admin" | "member">(
    "member",
  );
  const [name, setName] = React.useState(group.name);
  const [transferId, setTransferId] = React.useState("");

  const [removingMember, setRemovingMember] = React.useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [removingTask, setRemovingTask] = React.useState<ManageTask | null>(
    null,
  );
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  // Candidates ownership can pass to: any current member who isn't the owner.
  const transferCandidates = members.filter((m) => m.role !== "owner");
  const transferName = members.find((m) => m.userId === transferId)?.name;

  const joinUrl = (code: string) =>
    `${typeof location !== "undefined" ? location.origin : ""}/join/${code}`;

  const addTask = () =>
    taskAct.run(
      () =>
        act.addTask(group.id, {
          label: newLabel,
          subtitle: newSubtitle,
          target: newTarget,
        }),
      () => {
        setNewLabel("");
        setNewSubtitle("");
        setNewTarget("100");
      },
    );

  return (
    <div className="flex flex-col gap-6 px-4 pt-4 pb-6">
      <div>
        <Link
          href="/groups"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" /> Back
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Manage
          </h1>
          <span className="font-display text-2xl font-bold text-primary">
            {group.name}
          </span>
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
                <Avatar name={m.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    {m.name}
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
                      disabled={isSelf || membersAct.pending}
                      onChange={(r) => {
                        if (r === "admin" || r === "member")
                          membersAct.run(() =>
                            act.setMemberRole(group.id, m.userId, r),
                          );
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-500/10 disabled:opacity-40"
                      disabled={isSelf}
                      onClick={() =>
                        setRemovingMember({ userId: m.userId, name: m.name })
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
        <ErrorNote error={membersAct.error} />

        {/* Share / invites (D34: links are shared by you — nothing is emailed) */}
        <Card className="mt-3 flex flex-col gap-4 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Add people</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Create an invite link and share it yourself (WhatsApp, in person).
              Locking an invite to an email makes it single-use for that person;
              an open link works for anyone until you revoke it.
            </p>
          </div>

          <Field
            label="Lock to an email (optional)"
            htmlFor="invite-email"
            hint="They must sign in with this email to join."
          >
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
                onChange={(r) => {
                  if (r === "admin" || r === "member") setInviteRole(r);
                }}
              />
              <Button
                variant="primary"
                disabled={inviteAct.pending}
                onClick={() =>
                  inviteAct.run(
                    () => act.createInvite(group.id, inviteRole, inviteEmail),
                    () => {
                      setInviteEmail("");
                      setInviteRole("member");
                    },
                  )
                }
              >
                {inviteAct.pending ? "Creating…" : "Create invite"}
              </Button>
            </div>
          </Field>
          <ErrorNote error={inviteAct.error} />

          {invites.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Active invites ({invites.length})
              </p>
              {invites.map((i) => (
                <div key={i.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {i.email ?? "Open link — anyone can join"}
                    </span>
                    <Badge
                      variant={i.role === "admin" ? "primary" : "neutral"}
                      size="sm"
                    >
                      {i.role === "admin" ? "co-admin" : "member"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-500/10"
                      onClick={() =>
                        inviteAct.run(() => act.revokeInvite(i.id))
                      }
                    >
                      Revoke
                    </Button>
                  </div>
                  <CopyField label="Invite link" value={joinUrl(i.code)} />
                </div>
              ))}
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
              disabled={!newLabel.trim() || taskAct.pending}
              onClick={addTask}
            >
              {taskAct.pending ? "Adding…" : "Add task"}
            </Button>
            <ErrorNote error={taskAct.error} />
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
                disabled={
                  !name.trim() ||
                  name.trim() === group.name ||
                  settingsAct.pending
                }
                onClick={() =>
                  settingsAct.run(() => act.renameGroup(group.id, name))
                }
              >
                Save
              </Button>
            </div>
          </Field>
          <ErrorNote error={settingsAct.error} />
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
                      {m.name}
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
            <ErrorNote error={ownershipAct.error} />

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
        ) : (
          <Card className="p-4 text-sm text-muted-foreground">
            Owned by{" "}
            <span className="font-medium text-foreground">
              {owner?.name ?? "—"}
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
          if (transferId)
            ownershipAct.run(
              () => act.transferOwnership(group.id, transferId),
              () => setTransferId(""),
            );
        }}
        title={`Make ${transferName ?? "this member"} the owner?`}
        description="They gain full control of the group — including the ability to delete it. You'll stay on as a co-admin."
        confirmLabel="Transfer ownership"
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => ownershipAct.run(() => act.deleteGroup(group.id))}
        title={`Delete "${group.name}"?`}
        description="This removes the group, its tasks, and all member records. This can't be undone."
        confirmLabel="Delete group"
      />
      <ConfirmDialog
        open={!!removingMember}
        onClose={() => setRemovingMember(null)}
        onConfirm={() =>
          removingMember &&
          membersAct.run(() =>
            act.removeMember(group.id, removingMember.userId),
          )
        }
        title={`Remove ${removingMember?.name ?? ""}?`}
        description="They lose access to this group. Their past history is kept and they can be re-added anytime."
        confirmLabel="Remove from group"
      />
      <ConfirmDialog
        open={!!removingTask}
        onClose={() => setRemovingTask(null)}
        onConfirm={() =>
          removingTask && taskAct.run(() => act.deleteTask(removingTask.id))
        }
        title={`Remove "${removingTask?.label ?? ""}"?`}
        description="This task and its logged counts are removed for everyone in the group."
        confirmLabel="Remove task"
      />
    </div>
  );
}

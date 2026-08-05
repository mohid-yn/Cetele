"use client";

import * as React from "react";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Eyebrow,
  Field,
  Input,
  ConfirmDialog,
} from "@/components/ui";
import { ArrowLeftIcon, PlusIcon, CheckIcon } from "@/components/app/icons";
import { RoleToggle, selectCls } from "@/components/app/role-toggle";
import { FrequencyPicker } from "@/components/app/frequency-picker";
import { useAction } from "@/lib/use-action";
import { usePropState } from "@/lib/use-prop-state";
import { frequencyLabel } from "@/lib/goals";
import { langOf } from "@/lib/text-direction";
import {
  assigneeLabel,
  currentAssignees,
  type Assignment,
} from "@/lib/assignments";
import { AssigneesDialog } from "./assignees-dialog";
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
  /** The programme this circle follows (D55), or null — most follow none. */
  roadmap_id: string | null;
};
export type ManageMember = {
  userId: string;
  role: Role;
  name: string;
  avatarUrl: string | null;
};
export type ManageTask = {
  /** How often this task comes round, in days (0021). 1 = daily. */
  frequency_days: number;
  id: string;
  label: string;
  subtitle: string | null;
  target_count: number;
  sort_order: number;
};
/**
 * A ONE-OFF invite, locked to an email and consumed on accept. The circle's
 * open link is not one of these — it is a single code passed as `defaultCode`,
 * because there is exactly one and it is regenerated rather than listed (0022).
 * No `role`: an invite always joins at member, so a badge saying so would be
 * chrome that never changes.
 */
export type ManageInvite = {
  id: string;
  email: string | null;
  code: string;
};

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
  groupId,
  task,
  members,
  assignees,
  onRemove,
  onSaved,
  onAssigneesSaved,
}: {
  groupId: string;
  task: ManageTask;
  members: ManageMember[];
  /** `null` = everyone (0023). */
  assignees: string[] | null;
  onRemove: (task: ManageTask) => void;
  onSaved: (task: ManageTask) => void;
  onAssigneesSaved: (taskId: string, assignees: string[] | null) => void;
}) {
  const { pending, error, run } = useAction();
  const [editing, setEditing] = React.useState(false);
  const [pickingWho, setPickingWho] = React.useState(false);
  const [label, setLabel] = React.useState(task.label);
  const [subtitle, setSubtitle] = React.useState(task.subtitle ?? "");
  const [target, setTarget] = React.useState(String(task.target_count));
  const [frequency, setFrequency] = React.useState(String(task.frequency_days));

  const save = () =>
    run(
      () =>
        act.updateTask(groupId, task.id, {
          label,
          subtitle,
          target,
          frequency,
        }),
      () => {
        // Optimistic: hand the edited row up so the list re-renders now (CET-30),
        // mirroring the trim/parse the action applies server-side.
        onSaved({
          ...task,
          label: label.trim(),
          subtitle: subtitle.trim() || null,
          target_count: parseInt(target, 10),
          frequency_days: parseInt(frequency, 10),
        });
        setEditing(false);
      },
    );

  if (editing) {
    return (
      <li className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2">
          {/* aria-label, not placeholder alone: a placeholder is not an
              accessible name, and it vanishes the moment you start typing —
              so mid-edit there was nothing naming these three fields. */}
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label"
            aria-label="Task label"
          />
          <Input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle (e.g. Arabic)"
            aria-label="Task subtitle"
            dir="auto"
          />
          <Input
            value={target}
            inputMode="numeric"
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))}
            placeholder="Target each time"
            aria-label="Target each time"
          />
          <FrequencyPicker
            id={`freq-${task.id}`}
            value={parseInt(frequency, 10)}
            onChange={(d) => setFrequency(String(d))}
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

  const whoFor = assigneeLabel(
    assignees,
    (id) => members.find((m) => m.userId === id)?.name,
  );

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{task.label}</p>
        {/* `truncate` already contains the overflow here (one line, ellipsis,
            no wrapping), so this row needs the dir/lang fix only. */}
        {task.subtitle && (
          <p
            className="truncate text-sm text-muted-foreground"
            dir="auto"
            lang={langOf(task.subtitle)}
          >
            {task.subtitle}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          <span className="tabular-nums">
            target {task.target_count.toLocaleString()}
          </span>
          {" · "}
          {frequencyLabel(task.frequency_days).toLowerCase()}
        </p>
        {/* `outline`, not `ghost`: this is the one control on the row that
            carries a SETTING rather than an action, and it has to read as
            something you can open. The accessible name names the task, because
            "Everyone" repeated down a list says nothing about which row it
            belongs to. */}
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          aria-label={`Who is ${task.label} for? Currently ${whoFor}`}
          onClick={() => setPickingWho(true)}
        >
          {whoFor}
        </Button>
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
      <AssigneesDialog
        open={pickingWho}
        onClose={() => setPickingWho(false)}
        groupId={groupId}
        taskId={task.id}
        taskLabel={task.label}
        members={members}
        assignees={assignees}
        onSaved={(next) => onAssigneesSaved(task.id, next)}
      />
    </li>
  );
}

export function ManageClient({
  group,
  me,
  myRole,
  members: propMembers,
  tasks: propTasks,
  assignments: propAssignments,
  invites: propInvites,
  defaultCode: propDefaultCode,
  canClaim,
  roadmaps,
}: {
  group: ManageGroup;
  me: string;
  myRole: Role;
  members: ManageMember[];
  tasks: ManageTask[];
  assignments: Assignment[];
  invites: ManageInvite[];
  defaultCode: string | null;
  canClaim: boolean;
  /** Published programmes this circle could follow (D55). Often empty. */
  roadmaps: { id: string; name: string }[];
}) {
  // The three lists render from local state (CET-30): a mutation shows the
  // moment its action succeeds, without waiting on a refetch that can be dropped.
  const [members, setMembers] = usePropState(propMembers);
  const [tasks, setTasks] = usePropState(propTasks);
  const [invites, setInvites] = usePropState(propInvites);
  const [defaultCode, setDefaultCode] = usePropState(propDefaultCode);
  const [roadmapId, setRoadmapId] = usePropState(group.roadmap_id);

  // Assignments are held as the RESOLVED per-task answer rather than as raw
  // intervals: this screen only ever edits the present, and reconciling a
  // save's own return (D45) is simpler on the shape the dialog hands back.
  const [assignees, setAssignees] = usePropState(
    React.useMemo(
      () =>
        Object.fromEntries(
          propTasks.map((t) => [t.id, currentAssignees(propAssignments, t.id)]),
        ) as Record<string, string[] | null>,
      [propTasks, propAssignments],
    ),
  );

  const isOwner = myRole === "owner";
  const owner = members.find((m) => m.role === "owner");

  const membersAct = useAction();
  const inviteAct = useAction();
  // Regenerate gets its OWN action state, not inviteAct's: the two live in the
  // same card, and sharing one would let a failed "add locked invite" print its
  // error under the link the admin just successfully regenerated.
  const regenAct = useAction();
  const [regenOpen, setRegenOpen] = React.useState(false);
  const taskAct = useAction();
  const settingsAct = useAction();
  const ownershipAct = useAction();
  const roadmapAct = useAction();
  const claimAct = useAction();
  const [claimOpen, setClaimOpen] = React.useState(false);

  const [newLabel, setNewLabel] = React.useState("");
  const [newSubtitle, setNewSubtitle] = React.useState("");
  const [newTarget, setNewTarget] = React.useState("100");
  const [newFrequency, setNewFrequency] = React.useState("1");
  const [inviteEmail, setInviteEmail] = React.useState("");
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

  // Resolved after mount: reading location.origin during render made the SSR
  // HTML ("" + path) disagree with the first client render (full URL) — a React
  // hydration text mismatch on every invite link. Both now render the bare path
  // first; the origin fills in post-mount.
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, same pattern as the theme provider
    setOrigin(location.origin);
  }, []);
  const joinUrl = (code: string) => `${origin}/join/${code}`;

  const addTask = () =>
    taskAct.run(
      () =>
        act.addTask(group.id, {
          label: newLabel,
          subtitle: newSubtitle,
          target: newTarget,
          frequency: newFrequency,
        }),
      (res) => {
        if (res.task) setTasks((ts) => [...ts, res.task!]);
        setNewLabel("");
        setNewSubtitle("");
        setNewTarget("100");
        setNewFrequency("1");
      },
    );

  return (
    <div className="flex flex-col gap-6 px-5 pt-6 pb-8 lg:px-8">
      <div>
        {/* -ml-2 + py-2 so the tap area clears 44px without visually indenting
            the label from the h1 below it. */}
        <Link
          href="/groups"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
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

      {/* Succession (M7 · D27) — claim an absent owner's group ------------ */}
      {canClaim && (
        <Card className="border-warning-500/40 bg-warning-500/10 p-4">
          <p className="text-sm font-semibold text-foreground">
            Keep this circle running
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {owner?.name ?? "The owner"} hasn&rsquo;t been active in a while. As
            a co-admin you can take over ownership so the circle isn&rsquo;t
            left without one — they stay on as a co-admin.
          </p>
          <Button
            size="sm"
            variant="primary"
            className="mt-3"
            disabled={claimAct.pending}
            onClick={() => setClaimOpen(true)}
          >
            Claim ownership
          </Button>
          <ErrorNote error={claimAct.error} />
        </Card>
      )}

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
                {/* `min-w-0 flex-1` alone let the name shrink to ~31px so the
                    role toggle and Remove could stay on one line — "Dev
                    Reviewer (you)" rendered as "Dev |" and "Yusuf" as "Yusu".
                    A destructive action next to an unreadable name is the
                    actual bug. A real basis makes the CONTROLS wrap to their
                    own line instead, which is what `flex-wrap` was for. */}
                <div className="min-w-0 flex-1 basis-40">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    {m.name}
                    {isSelf && (
                      <span className="shrink-0 text-xs text-muted-foreground">
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
                  // One wrapping unit: the toggle and Remove travel together to
                  // a second line rather than splitting across the row.
                  <div className="ml-auto flex items-center gap-2">
                    <RoleToggle
                      value={m.role}
                      disabled={isSelf || membersAct.pending}
                      onChange={(r) => {
                        if (r === "admin" || r === "member")
                          membersAct.run(
                            () => act.setMemberRole(group.id, m.userId, r),
                            () =>
                              setMembers((ms) =>
                                ms.map((x) =>
                                  x.userId === m.userId ? { ...x, role: r } : x,
                                ),
                              ),
                          );
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      // No `disabled:opacity-40`: the primitive's base already
                      // sets `disabled:text-disabled-foreground`, and fading
                      // danger text by 40% was putting a destructive label
                      // below the readable floor.
                      className="text-danger hover:bg-danger-500/10"
                      disabled={isSelf}
                      onClick={() =>
                        setRemovingMember({ userId: m.userId, name: m.name })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <ErrorNote error={membersAct.error} />

        {/* Share / invites (D34: links are shared by you — nothing is emailed)
            0022: the circle's link is a PROPERTY of the circle, not a thing you
            manage a list of. It always exists and it is regenerated, never
            revoked-and-recreated — so the common case ("let me send someone the
            link") is a copy button and nothing else. */}
        <Card className="mt-3 flex flex-col gap-4 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Add people</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Share this link yourself (WhatsApp, in person) — nothing is
              emailed. Anyone who opens it joins as a member; co-admins are made
              in the members list above, never by a link.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <CopyField
              label="Invite link"
              value={defaultCode ? joinUrl(defaultCode) : "—"}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Regenerating makes a new link and stops the old one working.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={regenAct.pending}
                onClick={() => setRegenOpen(true)}
              >
                {regenAct.pending ? "Regenerating…" : "Regenerate"}
              </Button>
            </div>
            <ErrorNote error={regenAct.error} />
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <div>
              <Eyebrow>Invite one person</Eyebrow>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A single-use link locked to one email — it stops working the
                moment they join.
              </p>
            </div>
            <Field
              label="Lock to an email"
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
                <Button
                  variant="primary"
                  disabled={inviteAct.pending}
                  onClick={() =>
                    inviteAct.run(
                      () => act.createInvite(group.id, inviteEmail),
                      (res) => {
                        if (res.invite)
                          setInvites((iv) => [...iv, res.invite!]);
                        setInviteEmail("");
                      },
                    )
                  }
                >
                  {inviteAct.pending ? "Creating…" : "Create invite"}
                </Button>
              </div>
            </Field>
            <ErrorNote error={inviteAct.error} />
          </div>

          {invites.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <Eyebrow>Waiting to be used ({invites.length})</Eyebrow>
              {invites.map((i) => (
                <div key={i.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {i.email}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-500/10"
                      onClick={() =>
                        inviteAct.run(
                          () => act.revokeInvite(group.id, i.id),
                          () =>
                            setInvites((iv) => iv.filter((x) => x.id !== i.id)),
                        )
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
          Targets are per person. A task goes to everyone unless you pick who
          it&rsquo;s for.
        </p>
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              groupId={group.id}
              task={t}
              members={members}
              assignees={assignees[t.id] ?? null}
              onRemove={setRemovingTask}
              onSaved={(u) =>
                setTasks((ts) => ts.map((x) => (x.id === u.id ? u : x)))
              }
              onAssigneesSaved={(taskId, next) =>
                setAssignees((a) => ({ ...a, [taskId]: next }))
              }
            />
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
              aria-label="New task label"
            />
            <Input
              value={newSubtitle}
              onChange={(e) => setNewSubtitle(e.target.value)}
              placeholder="Subtitle (optional)"
              aria-label="New task subtitle"
              dir="auto"
            />
            <Input
              value={newTarget}
              inputMode="numeric"
              onChange={(e) => setNewTarget(e.target.value.replace(/\D/g, ""))}
              placeholder="Daily target"
              aria-label="New task daily target"
            />
            <FrequencyPicker
              id="new-task-frequency"
              label="How often"
              value={parseInt(newFrequency, 10)}
              onChange={(d) => setNewFrequency(String(d))}
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

      {/* Programme ------------------------------------------------------- */}
      {roadmaps.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Programme
          </h2>
          <Card className="p-4">
            <Field label="This circle follows" htmlFor="group-roadmap">
              <select
                id="group-roadmap"
                className={selectCls}
                value={roadmapId ?? ""}
                disabled={roadmapAct.pending}
                onChange={(e) => {
                  const next = e.target.value || null;
                  const previous = roadmapId;
                  // Optimistic, undone on refusal — without the undo a write
                  // RLS filtered away still looks applied (lib/use-action.ts).
                  setRoadmapId(next);
                  void roadmapAct.run(
                    () => act.setGroupRoadmap(group.id, next),
                    undefined,
                    () => setRoadmapId(previous),
                  );
                }}
              >
                <option value="">No programme</option>
                {roadmaps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="mt-2 text-xs text-muted-foreground">
              Everyone in the circle sees the programme and records their own
              progress. You and the organisers can see how far each member has
              got; nothing on it affects streaks or the circle&rsquo;s figures.
            </p>
            <ErrorNote error={roadmapAct.error} />
          </Card>
        </section>
      )}

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
              {/* Danger zone: the heading stays neutral — ONE red element, the
                  action itself (a real outlined button, escalating to the solid
                  destructive confirm in the dialog). A red heading + red button
                  was double-shouting, and the ghost button read as plain text. */}
              <p className="mb-1 text-sm font-medium text-foreground">
                Delete this group
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Removes the group, its tasks, and all member records. This
                can&rsquo;t be undone.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-danger-500/40 text-danger hover:border-danger-500/60 hover:bg-danger-500/10"
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
      {/* Regenerate is confirmed because it is irreversible and its blast
          radius is invisible from here: every copy of the old link already
          shared — group chats, a pinned message — dies at once. */}
      <ConfirmDialog
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        onConfirm={() =>
          regenAct.run(
            () => act.regenerateInvite(group.id),
            (res) => {
              if (res.code) setDefaultCode(res.code);
            },
          )
        }
        title="Make a new invite link?"
        description="The current link stops working immediately — anyone you already sent it to will need the new one. People who have already joined are unaffected."
        confirmLabel="Regenerate link"
      />
      <ConfirmDialog
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        onConfirm={() => claimAct.run(() => act.claimOwnership(group.id))}
        title="Claim ownership of this circle?"
        description="The current owner has been inactive, so you can take over to keep the circle running. They stay on as a co-admin. This is recorded in the group's history."
        confirmLabel="Claim ownership"
      />
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
          membersAct.run(
            () => act.removeMember(group.id, removingMember.userId),
            () =>
              setMembers((ms) =>
                ms.filter((x) => x.userId !== removingMember.userId),
              ),
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
          removingTask &&
          taskAct.run(
            () => act.deleteTask(group.id, removingTask.id),
            () => setTasks((ts) => ts.filter((x) => x.id !== removingTask.id)),
          )
        }
        title={`Remove "${removingTask?.label ?? ""}"?`}
        description="This task and its logged counts are removed for everyone in the group."
        confirmLabel="Remove task"
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Button, Card, Input } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { ArrowLeftIcon, PlusIcon } from "@/components/demo/icons";
import type { Task } from "@/lib/mock/types";

function TaskRow({ task }: { task: Task }) {
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
      <li className="rounded-xl border border-border bg-card p-3">
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
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
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
          target {task.targetCount.toLocaleString()}
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-danger hover:bg-danger-500/10"
        onClick={() => {
          if (confirm(`Remove "${task.label}"?`)) actions.removeTask(task.id);
        }}
      >
        Remove
      </Button>
    </li>
  );
}

export default function ManageGroupPage() {
  const router = useRouter();
  const { state, actions } = useMock();
  const group = sel.activeGroup(state);
  const tasks = sel.groupTasks(state, group.id);
  const members = sel.groupMembers(state, group.id);
  const canManage =
    state.session.viewRole === "group_admin" ||
    state.session.viewRole === "admin";

  const [newLabel, setNewLabel] = React.useState("");
  const [newSubtitle, setNewSubtitle] = React.useState("");
  const [newTarget, setNewTarget] = React.useState("100");
  const [inviteName, setInviteName] = React.useState("");

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
            Switch to <strong>Group admin</strong> in Demo Controls to manage
            this group.
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
    <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeftIcon />}
          onClick={() => router.push("/group")}
        >
          {group.name}
        </Button>
      </div>
      <h1 className="font-display text-2xl font-bold text-foreground">
        Manage group
      </h1>

      {/* Task list */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Tasks &amp; targets
        </h2>
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>

        <Card className="mt-3 p-3">
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
              onClick={addTask}
            >
              Add task
            </Button>
          </div>
        </Card>
      </section>

      {/* Members */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Members ({members.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const isSelf = m.userId === state.session.currentUserId;
            return (
              <li
                key={m.userId}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
              >
                <Avatar name={m.user.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    {m.user.name}
                    {m.role === "group_admin" && (
                      <Badge variant="primary" size="sm">
                        admin
                      </Badge>
                    )}
                  </p>
                </div>
                {!isSelf && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        actions.setMemberRole(
                          m.userId,
                          group.id,
                          m.role === "group_admin" ? "member" : "group_admin",
                        )
                      }
                    >
                      {m.role === "group_admin" ? "Demote" : "Make admin"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-500/10"
                      onClick={() => {
                        if (confirm(`Remove ${m.user.name}?`))
                          actions.removeMember(m.userId, group.id);
                      }}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <Card className="mt-3 p-3">
          <p className="mb-2 text-sm font-semibold text-foreground">
            Invite a member
          </p>
          <div className="flex gap-2">
            <Input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Name"
            />
            <Button
              variant="primary"
              onClick={() => {
                if (!inviteName.trim()) return;
                actions.inviteMember(inviteName.trim(), group.id);
                setInviteName("");
              }}
            >
              Add
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Or share invite code{" "}
            <span className="font-mono font-medium text-foreground">
              {group.inviteCode}
            </span>
          </p>
        </Card>
      </section>
    </div>
  );
}

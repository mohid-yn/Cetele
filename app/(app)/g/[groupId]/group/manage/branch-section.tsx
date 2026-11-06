"use client";

import * as React from "react";
import { Badge, Button, Card, ConfirmDialog, Field } from "@/components/ui";
import { selectCls } from "@/components/app/role-toggle";
import { useAction } from "@/lib/use-action";
import {
  cancelBranchRequest,
  leaveBranch,
  requestBranch,
} from "./branch-actions";

export type DirectoryEntry = { id: string; label: string };

/**
 * Which branch this circle is in (D79), from the circle admin's side.
 *
 * Joining is a REQUEST that a steward approves, because being in a branch is
 * what shows a circle the venues of its camps. What the circle shares in
 * return is its name and its size. Never who is in it, or their dhikr.
 */
export function BranchSection({
  groupId,
  current,
  pending,
  directory,
}: {
  groupId: string;
  current: DirectoryEntry | null;
  pending: DirectoryEntry | null;
  directory: DirectoryEntry[];
}) {
  const [choice, setChoice] = React.useState("");
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  const act = useAction();
  const [joined, setJoined] = React.useState<string | null>(null);

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-foreground">Branch</h2>
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted-foreground">
          A branch is where your circle is. Members see the camps and halaqahs
          posted there and in every branch above it. Its organisers see your
          circle&apos;s name and size, and nothing about anyone&apos;s dhikr.
        </p>

        {current && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">In</p>
              <p className="text-sm font-medium text-foreground">
                {current.label}
              </p>
            </div>
            <Button
              variant="destructive-outline"
              size="sm"
              onClick={() => setConfirmLeave(true)}
            >
              Leave branch
            </Button>
          </div>
        )}

        {pending && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
            <div className="min-w-0">
              <Badge variant="warning" size="sm">
                Waiting for approval
              </Badge>
              <p className="mt-1 text-sm text-foreground">{pending.label}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={act.pending}
              onClick={() => void act.run(() => cancelBranchRequest(groupId))}
            >
              Withdraw
            </Button>
          </div>
        )}

        {joined && <p className="text-sm font-medium text-success">{joined}</p>}

        {directory.length > 0 ? (
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void act.run(
                () => requestBranch(groupId, choice),
                (res) => {
                  setChoice("");
                  setJoined(
                    res.outcome === "joined"
                      ? "Done. Your circle is in the branch."
                      : "Asked. An organiser of that branch will approve it.",
                  );
                },
              );
            }}
          >
            <Field
              label={
                current
                  ? "Move to another branch"
                  : pending
                    ? "Ask a different branch"
                    : "Ask to join a branch"
              }
              htmlFor="branch-choice"
              className="flex-1"
            >
              <select
                id="branch-choice"
                className={selectCls + " w-full"}
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
              >
                <option value="">Choose a place…</option>
                {directory
                  .filter((d) => d.id !== current?.id)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
              </select>
            </Field>
            <Button
              type="submit"
              variant="tonal"
              disabled={!choice || act.pending}
            >
              Ask
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            There are no branches yet. Your organisation&apos;s organisers
            create them.
          </p>
        )}
        {act.error && (
          <p role="alert" className="text-xs text-danger">
            {act.error}
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Leave this branch?"
        description="Your circle will stop seeing its events. Rejoining needs an organiser's approval again."
        confirmLabel="Leave"
        onConfirm={() => {
          setConfirmLeave(false);
          void act.run(() => leaveBranch(groupId));
        }}
      />
    </section>
  );
}

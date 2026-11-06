"use client";

import * as React from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
} from "@/components/ui";
import { ChevronRightIcon, PencilIcon } from "@/components/app/icons";
import { SectionHeading } from "@/components/app/section-heading";
import { useAction } from "@/lib/use-action";
import { NewBranchButton } from "../new-branch";
import {
  appointSteward,
  decideRequest,
  deleteBranch,
  removeCircle,
  removeSteward,
  renameBranch,
} from "../actions";

type Circle = {
  groupId: string;
  name: string;
  members: number;
  pending: boolean;
};
type Steward = { userId: string; name: string | null; email: string };
type Child = { id: string; name: string; circles: number; pending: number };

export function BranchDetail({
  me,
  branch,
  canDelete,
  subBranches,
  circles,
  stewards,
}: {
  me: string;
  branch: { id: string; name: string; parentId: string | null };
  canDelete: boolean;
  subBranches: Child[];
  circles: Circle[];
  stewards: Steward[];
}) {
  const waiting = circles.filter((c) => c.pending);
  const joined = circles.filter((c) => !c.pending);
  const decide = useAction();
  const remove = useAction();
  const [removing, setRemoving] = React.useState<Circle | null>(null);

  return (
    <>
      {waiting.length > 0 && (
        <section>
          <SectionHeading>Waiting to join</SectionHeading>
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border">
              {waiting.map((c) => (
                <li
                  key={c.groupId}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.members === 1 ? "1 member" : `${c.members} members`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.pending}
                      onClick={() =>
                        void decide.run(() =>
                          decideRequest(branch.id, c.groupId, false),
                        )
                      }
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      disabled={decide.pending}
                      onClick={() =>
                        void decide.run(() =>
                          decideRequest(branch.id, c.groupId, true),
                        )
                      }
                    >
                      Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">
            Approving lets the circle see this branch&apos;s events, venues
            included.
          </p>
          {decide.error && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {decide.error}
            </p>
          )}
        </section>
      )}

      <section>
        <SectionHeading action={`${joined.length}`}>Circles</SectionHeading>
        {joined.length > 0 ? (
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border">
              {joined.map((c) => (
                <li
                  key={c.groupId}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.members === 1 ? "1 member" : `${c.members} members`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemoving(c)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            No circles yet. A circle&apos;s admin asks to join from their
            circle&apos;s Manage screen, and the request appears here.
          </p>
        )}
        {remove.error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {remove.error}
          </p>
        )}
      </section>

      <section>
        <SectionHeading
          action={
            <NewBranchButton
              parentId={branch.id}
              parentName={branch.name}
              label="Add"
            />
          }
        >
          Branches inside
        </SectionHeading>
        {subBranches.length > 0 ? (
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border">
              {subBranches.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/branches/${c.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {c.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.circles === 1 ? "1 circle" : `${c.circles} circles`}
                      </span>
                    </span>
                    {c.pending > 0 && (
                      <Badge variant="accent" size="sm">
                        {c.pending} waiting
                      </Badge>
                    )}
                    <ChevronRightIcon
                      aria-hidden
                      className="size-5 text-muted-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            None. Add one for a smaller area, like a suburb inside a city.
          </p>
        )}
      </section>

      <Stewards me={me} branch={branch} stewards={stewards} />

      <BranchSettings branch={branch} canDelete={canDelete} />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this circle from the branch?"
        description={
          removing
            ? `${removing.name} will stop seeing ${branch.name}'s events. Their dhikr, members and streaks are not affected.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target)
            void remove.run(() => removeCircle(branch.id, target.groupId));
        }}
      />
    </>
  );
}

function Stewards({
  me,
  branch,
  stewards,
}: {
  me: string;
  branch: { id: string; name: string };
  stewards: Steward[];
}) {
  const [email, setEmail] = React.useState("");
  const appoint = useAction();
  const remove = useAction();
  const [removing, setRemoving] = React.useState<Steward | null>(null);

  return (
    <section>
      <SectionHeading>Stewards</SectionHeading>
      <p className="mb-2 text-xs text-muted-foreground">
        They post events here and in every branch inside, approve circles, and
        see who is coming. They see no circle&apos;s dhikr.
      </p>
      {stewards.length > 0 && (
        <Card className="mb-3 overflow-hidden">
          <ul className="flex flex-col divide-y divide-border">
            {stewards.map((s) => (
              <li key={s.userId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {s.name ?? "Unnamed"}
                    {s.userId === me && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.email}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRemoving(s)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void appoint.run(
            () => appointSteward(branch.id, email),
            () => setEmail(""),
          );
        }}
      >
        <Field
          label="Appoint a steward"
          htmlFor="steward-email"
          hint="Their exact email address. There is no directory to search."
          className="flex-1"
        >
          <Input
            id="steward-email"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          variant="tonal"
          disabled={!email.trim() || appoint.pending}
        >
          {appoint.pending ? "Appointing…" : "Appoint"}
        </Button>
      </form>
      {(appoint.error || remove.error) && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {appoint.error ?? remove.error}
        </p>
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this steward?"
        description={
          removing
            ? `${removing.name ?? removing.email} will stop running ${branch.name}.${removing.userId === me ? " This is you." : ""}`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target)
            void remove.run(() => removeSteward(branch.id, target.userId));
        }}
      />
    </section>
  );
}

function BranchSettings({
  branch,
  canDelete,
}: {
  branch: { id: string; name: string; parentId: string | null };
  canDelete: boolean;
}) {
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(branch.name);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const rename = useAction();
  const del = useAction();

  return (
    <section className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setName(branch.name);
          setRenaming(true);
        }}
      >
        <PencilIcon aria-hidden className="size-4" /> Rename
      </Button>
      {canDelete && (
        <Button
          size="sm"
          variant="destructive-outline"
          onClick={() => setConfirmDelete(true)}
        >
          Delete branch
        </Button>
      )}
      {del.error && (
        <p role="alert" className="w-full text-xs text-danger">
          {del.error}
        </p>
      )}

      <Dialog
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename branch"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button
              disabled={rename.pending || !name.trim()}
              onClick={() =>
                void rename.run(
                  () => renameBranch(branch.id, name),
                  () => setRenaming(false),
                )
              }
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="rename-branch">
          <Input
            id="rename-branch"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {rename.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {rename.error}
          </p>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${branch.name}?`}
        description="Only an empty branch can be deleted: no branches inside, no circles, no events."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          void del.run(() => deleteBranch(branch.id, branch.parentId));
        }}
      />
    </section>
  );
}

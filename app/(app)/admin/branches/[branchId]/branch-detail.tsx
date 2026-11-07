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
import {
  BranchesIcon,
  ChevronRightIcon,
  PencilIcon,
} from "@/components/app/icons";
import { SectionHeading } from "@/components/app/section-heading";
import { useAction } from "@/lib/use-action";
import { NewBranchButton } from "../new-branch";
import {
  appointSteward,
  decideRequest,
  deleteBranch,
  moveBranch,
  moveCircle,
  removeCircle,
  removeSteward,
  renameBranch,
  setBranchArchived,
} from "../actions";
import type { Destination } from "../destinations";
import { selectCls } from "@/components/app/role-toggle";

type Circle = {
  groupId: string;
  name: string;
  members: number;
  pending: boolean;
};
type Steward = { userId: string; name: string | null; email: string };
type Child = { id: string; name: string; circles: number; pending: number };

/**
 * The body of a branch's page (D85), in the order someone running it needs:
 * circles waiting on them, what happens here (`happening`, rendered on the
 * server), the branches inside it as folders, then its own circles. Stewards,
 * renaming and deleting are on the branch's settings screen, behind the gear.
 */
export function BranchDetail({
  branch,
  subBranches,
  circles,
  happening,
  destinations,
}: {
  branch: { id: string; name: string; parentId: string | null };
  subBranches: Child[];
  circles: Circle[];
  happening: React.ReactNode;
  /** Other live branches the viewer runs, for moving a circle (D87). */
  destinations: Destination[];
}) {
  const waiting = circles.filter((c) => c.pending);
  const joined = circles.filter((c) => !c.pending);
  const decide = useAction();
  const remove = useAction();
  const [removing, setRemoving] = React.useState<Circle | null>(null);
  const [moving, setMoving] = React.useState<Circle | null>(null);

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

      {happening}

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
          Inside {branch.name}
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
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-100 text-primary-800">
                      <BranchesIcon aria-hidden className="size-4" />
                    </span>
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
                  {destinations.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMoving(c)}
                    >
                      Move
                    </Button>
                  )}
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

      <MoveCircleDialog
        circle={moving}
        from={branch.name}
        destinations={destinations}
        onClose={() => setMoving(null)}
      />

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

export function Stewards({
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
      <SectionHeading>Admins</SectionHeading>
      <p className="mb-2 text-xs text-muted-foreground">
        They run this branch and every branch inside it: post camps and
        halaqahs, approve circles, add admins. They see each circle&apos;s name
        and size, never its members or anyone&apos;s dhikr.
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
          label="Add an admin"
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
          {appoint.pending ? "Adding…" : "Add"}
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
        title="Remove this admin?"
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

export function BranchSettings({
  branch,
  canDelete,
  canRehome = false,
  archived = false,
  moveTo = [],
  canMakeTop = false,
}: {
  branch: { id: string; name: string; parentId: string | null };
  canDelete: boolean;
  /** May move or archive it: the admins of the branch above (0047, D87). */
  canRehome?: boolean;
  archived?: boolean;
  /** Where it may go: live branches the viewer runs, outside its own subtree. */
  moveTo?: Destination[];
  /** An organiser may make it a top-level branch. */
  canMakeTop?: boolean;
}) {
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(branch.name);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [moving, setMoving] = React.useState(false);
  const [to, setTo] = React.useState("");
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const rename = useAction();
  const del = useAction();
  const move = useAction();
  const archive = useAction();
  const options = moveTo.filter((d) => d.id !== branch.parentId);
  const TOP = "__top__";

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
      {canRehome && (options.length > 0 || (canMakeTop && branch.parentId)) && (
        <Button size="sm" variant="outline" onClick={() => setMoving(true)}>
          Move
        </Button>
      )}
      {canRehome && (
        <Button
          size="sm"
          variant="outline"
          disabled={archive.pending}
          onClick={() =>
            archived
              ? void archive.run(() => setBranchArchived(branch.id, false))
              : setConfirmArchive(true)
          }
        >
          {archived ? "Restore" : "Archive"}
        </Button>
      )}
      {canDelete && (
        <Button
          size="sm"
          variant="destructive-outline"
          onClick={() => setConfirmDelete(true)}
        >
          Delete branch
        </Button>
      )}
      {(del.error || archive.error) && (
        <p role="alert" className="w-full text-xs text-danger">
          {del.error ?? archive.error}
        </p>
      )}

      <Dialog
        open={moving}
        onClose={() => setMoving(false)}
        title={`Move ${branch.name}`}
        description="Everything inside moves with it. Its circles then hear from the branches above its new place."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(false)}>
              Cancel
            </Button>
            <Button
              disabled={!to || move.pending}
              onClick={() =>
                void move.run(
                  () => moveBranch(branch.id, to === TOP ? null : to),
                  () => {
                    setMoving(false);
                    setTo("");
                  },
                )
              }
            >
              {move.pending ? "Moving…" : "Move"}
            </Button>
          </>
        }
      >
        <Field label="Into" htmlFor="move-branch-to">
          <select
            id="move-branch-to"
            className={selectCls + " w-full"}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
            <option value="">Choose a branch…</option>
            {canMakeTop && branch.parentId && (
              <option value={TOP}>Top level (a new organisation)</option>
            )}
            {options.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        {move.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {move.error}
          </p>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={`Archive ${branch.name}?`}
        description="It and every branch inside it stop reaching their circles and leave the pickers. Nothing is deleted: camps, halaqahs and circles stay, and you can restore it."
        confirmLabel="Archive"
        onConfirm={() => {
          setConfirmArchive(false);
          void archive.run(() => setBranchArchived(branch.id, true));
        }}
      />

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

/**
 * Move a circle to another branch the viewer runs (D87). Only where it sits
 * changes: its members, tasks and dhikr are the circle's and stay so (D27).
 */
function MoveCircleDialog({
  circle,
  from,
  destinations,
  onClose,
}: {
  circle: Circle | null;
  from: string;
  destinations: Destination[];
  onClose: () => void;
}) {
  const [to, setTo] = React.useState("");
  const act = useAction();
  return (
    <Dialog
      open={circle !== null}
      onClose={() => {
        setTo("");
        onClose();
      }}
      title={circle ? `Move ${circle.name}` : "Move circle"}
      description={`From ${from}. It will hear about the new branch's camps and halaqahs instead. Its members and their dhikr are not affected.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!to || act.pending}
            onClick={() =>
              circle &&
              void act.run(
                () => moveCircle(circle.groupId, to),
                () => {
                  setTo("");
                  onClose();
                },
              )
            }
          >
            {act.pending ? "Moving…" : "Move"}
          </Button>
        </>
      }
    >
      <Field label="To" htmlFor="move-circle-to">
        <select
          id="move-circle-to"
          className={selectCls + " w-full"}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        >
          <option value="">Choose a branch…</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </Field>
      {act.error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {act.error}
        </p>
      )}
    </Dialog>
  );
}

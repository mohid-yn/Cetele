"use client";

import * as React from "react";
import { Button, ConfirmDialog, Dialog, Field, Input } from "@/components/ui";
import { PencilIcon, PlusIcon } from "@/components/app/icons";
import { useAction } from "@/lib/use-action";
import { selectCls } from "@/components/app/role-toggle";
import { CATEGORY_LABEL, type RoadmapCategory } from "@/lib/roadmap";
import {
  createRoadmapItem,
  deleteRoadmapItem,
  setRoadmapItemShape,
} from "./authoring-actions";

/**
 * Add or edit the SHAPE of a piece of work (D59, migration 0030) — the fields
 * completion is computed from. Its content (link, description, cover) belongs
 * to the other editor next door (0027), which is a separate dialog on purpose:
 * one is "what finishing this means", the other is "what it is and where it
 * lives", and they have different rules about when they may change.
 *
 * THE FREEZE IS SHOWN, NOT HIDDEN. Once anybody has recorded work against an
 * item, its level, category, unit, target and compulsory flag are fixed — the
 * database refuses to change them, because moving a target re-judges progress
 * members already earned. A UI that dropped those fields would leave an
 * organiser wondering where they went; one that let you edit them and then
 * failed on save would waste the typing. So they render disabled, with the
 * reason under them, and title/source stay editable beside them because a typo
 * in a lecture title should not have to stand all year.
 */
export type ItemShape = {
  id: string;
  level: number;
  category: RoadmapCategory;
  title: string;
  source: string | null;
  unit: string;
  target: number;
  compulsory: boolean;
  sortOrder: number;
  /** Has anyone recorded work against it? Frozen fields, if so. */
  recorded: boolean;
};

const CATEGORIES = Object.keys(CATEGORY_LABEL) as RoadmapCategory[];

export function ItemFormButton({
  roadmapId,
  item,
  level,
  nextSortOrder,
}: {
  roadmapId: string;
  /** Absent = adding. Present = editing that item. */
  item?: ItemShape;
  /** Which level a NEW item lands in — the section the button sits under. */
  level?: number;
  /** Where a NEW item sorts: after everything already in its category. */
  nextSortOrder?: number;
}) {
  const editing = item != null;
  const [open, setOpen] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  const act = useAction();
  const remove = useAction();

  const [form, setForm] = React.useState({
    level: String(item?.level ?? level ?? 1),
    category: (item?.category ?? "book") as string,
    title: item?.title ?? "",
    source: item?.source ?? "",
    unit: item?.unit ?? "",
    target: String(item?.target ?? 1),
    compulsory: item?.compulsory ?? false,
    sortOrder: String(item?.sortOrder ?? nextSortOrder ?? 0),
  });

  // Re-seed on open rather than on mount, exactly as the content editor does:
  // a form left half-typed and dismissed must not reopen holding stale text,
  // and a second organiser's change should be picked up rather than overwritten.
  const openDialog = () => {
    setForm({
      level: String(item?.level ?? level ?? 1),
      category: (item?.category ?? "book") as string,
      title: item?.title ?? "",
      source: item?.source ?? "",
      unit: item?.unit ?? "",
      target: String(item?.target ?? 1),
      compulsory: item?.compulsory ?? false,
      sortOrder: String(item?.sortOrder ?? nextSortOrder ?? 0),
    });
    setOpen(true);
  };

  const frozen = editing && item.recorded;

  const submit = () => {
    const payload = {
      level: parseInt(form.level, 10) || 1,
      category: form.category,
      title: form.title,
      source: form.source,
      unit: form.unit,
      target: parseInt(form.target, 10) || 1,
      compulsory: form.compulsory,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
    };
    void act.run(
      () =>
        editing
          ? setRoadmapItemShape(item.id, payload)
          : createRoadmapItem(roadmapId, payload),
      () => setOpen(false),
    );
  };

  const id = (f: string) => `item-${f}-${item?.id ?? `new-${level ?? 0}`}`;

  return (
    <>
      {editing ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={openDialog}
          aria-label={`Edit the shape of ${item.title}`}
        >
          <PencilIcon aria-hidden className="size-4" />
          Shape
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={openDialog}>
          <PlusIcon aria-hidden className="size-4" />
          Add work
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit the work" : "Add work"}
        description={
          editing
            ? item.title
            : `What a member has to do to finish this${level != null ? `, at level ${level}` : ""}.`
        }
        footer={
          <>
            {/* `mr-auto` pushes removal to the far left, away from Save — the
                shape every destructive-beside-confirm footer in this app uses,
                so the two are never adjacent enough to mis-tap. Absent
                entirely once anyone has recorded against the item, because the
                RPC would refuse it. */}
            {editing && !item.recorded && (
              <Button
                variant="ghost"
                className="mr-auto text-danger"
                onClick={() => setConfirmingRemove(true)}
              >
                Remove
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={
                act.pending ||
                form.title.trim() === "" ||
                form.unit.trim() === ""
              }
              onClick={submit}
            >
              {act.pending ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor={id("title")} required>
            <Input
              id={id("title")}
              value={form.title}
              autoComplete="off"
              placeholder="Calling to Good"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>

          <Field
            label="Source"
            htmlFor={id("source")}
            hint="Who it is by, or where it is from. Optional."
          >
            <Input
              id={id("source")}
              value={form.source}
              autoComplete="off"
              placeholder="M. Fethullah Gülen"
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </Field>

          {/* Everything below decides what FINISHING means, which is why it is
              one visually grouped block and why it locks together. */}
          <div className="flex flex-col gap-4 rounded-xl border border-border p-3">
            <div className="flex gap-3">
              <Field label="Level" htmlFor={id("level")} className="w-24">
                <Input
                  id={id("level")}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  disabled={frozen}
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                />
              </Field>
              <Field
                label="Category"
                htmlFor={id("category")}
                className="flex-1"
              >
                <select
                  id={id("category")}
                  className={selectCls + " w-full"}
                  disabled={frozen}
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="flex gap-3">
              <Field
                label="Target"
                htmlFor={id("target")}
                className="w-28"
                hint="1 = done or not"
              >
                <Input
                  id={id("target")}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  disabled={frozen}
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })}
                />
              </Field>
              <Field
                label="Unit"
                htmlFor={id("unit")}
                className="flex-1"
                hint="Plural: minutes, juz, chapters"
                required
              >
                <Input
                  id={id("unit")}
                  value={form.unit}
                  autoComplete="off"
                  placeholder="minutes"
                  disabled={frozen}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </Field>
            </div>

            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary"
                disabled={frozen}
                checked={form.compulsory}
                onChange={(e) =>
                  setForm({ ...form, compulsory: e.target.checked })
                }
              />
              <span className="text-sm text-foreground">
                Required — must be done even if the category&rsquo;s total is
                met
              </span>
            </label>

            {frozen && (
              <p className="text-xs text-muted-foreground">
                Members have recorded work against this, so what finishing it
                means is fixed. Its title, source, link, description and picture
                can still change. To take it out of circulation, unpublish the
                programme.
              </p>
            )}
          </div>

          <Field
            label="Position"
            htmlFor={id("sort")}
            className="w-28"
            hint="Lower first"
          >
            <Input
              id={id("sort")}
              type="number"
              inputMode="numeric"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          </Field>

          {act.error && (
            <p role="alert" className="text-sm text-danger">
              {act.error}
            </p>
          )}
        </div>
      </Dialog>

      {editing && (
        <ConfirmDialog
          open={confirmingRemove}
          onClose={() => setConfirmingRemove(false)}
          title="Remove this work?"
          description={`“${item.title}” comes off the programme. Nobody has recorded anything against it.`}
          confirmLabel="Remove"
          destructive
          onConfirm={() =>
            void remove.run(
              () => deleteRoadmapItem(item.id),
              () => {
                setConfirmingRemove(false);
                setOpen(false);
              },
            )
          }
        />
      )}
    </>
  );
}

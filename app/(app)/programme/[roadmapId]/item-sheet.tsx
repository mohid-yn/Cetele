"use client";

import * as React from "react";
import { Button, ConfirmDialog, Dialog, Field, Input } from "@/components/ui";
import { selectCls } from "@/components/app/role-toggle";
import { LockIcon } from "@/components/app/icons";
import { useAction } from "@/lib/use-action";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type RoadmapCategory,
} from "@/lib/roadmap";
import { deleteRoadmapItem, saveRoadmapItem } from "./authoring-actions";
import { CoverUpload } from "./cover-upload";

export type SheetItem = {
  id: string;
  level: number;
  category: RoadmapCategory;
  title: string;
  source: string | null;
  unit: string;
  target: number;
  compulsory: boolean;
  url: string | null;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  recorded: boolean;
};

/** What a new item in each category usually counts in. Only fills an empty box. */
const DEFAULT_UNIT: Record<RoadmapCategory, string> = {
  book: "book",
  quran: "juz",
  quran_studies: "chapters",
  memorisation: "surahs",
  listening: "minutes",
};

const seed = (item: SheetItem | null, level: number) => ({
  level: String(item?.level ?? level),
  category: (item?.category ?? "book") as RoadmapCategory,
  title: item?.title ?? "",
  source: item?.source ?? "",
  unit: item?.unit ?? DEFAULT_UNIT.book,
  target: String(item?.target ?? 1),
  compulsory: item?.compulsory ?? false,
  url: item?.url ?? "",
  description: item?.description ?? "",
  imageUrl: item?.imageUrl ?? "",
});

/**
 * One form for one item (D72). There used to be two dialogs on every row, a
 * pencil for its link and "Shape" for what finishing it means, and an organiser
 * had to know which held the field they wanted. The two sets of fields have
 * different rules, so the form keeps them apart visually and locks only the
 * block that decides completion.
 *
 * Rendered with a `key` per opening, so state is seeded fresh each time.
 */
export function ItemSheet({
  open,
  onClose,
  roadmapId,
  item,
  level,
  levels,
  nextSortOrder,
}: {
  open: boolean;
  onClose: () => void;
  roadmapId: string;
  /** Null means adding a new item. */
  item: SheetItem | null;
  /** Where a new item lands. */
  level: number;
  /** Existing level numbers. The next one is always offered too. */
  levels: number[];
  nextSortOrder: (level: number, category: RoadmapCategory) => number;
}) {
  const [form, setForm] = React.useState(() => seed(item, level));
  const [unitTouched, setUnitTouched] = React.useState(item != null);
  const [added, setAdded] = React.useState<{ title: string; n: number } | null>(
    null,
  );
  // If a new item saved but its link or description was refused, a retry has to
  // edit that item instead of creating it again.
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const save = useAction();
  const remove = useAction();

  const editing = item != null;
  const frozen = editing && item.recorded;
  const canSave =
    !save.pending && form.title.trim() !== "" && form.unit.trim() !== "";

  const levelChoices = React.useMemo(() => {
    const top = Math.max(0, ...levels, level);
    const set = new Set([...levels, level, top + 1]);
    return [...set].sort((a, b) => a - b);
  }, [levels, level]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (addAnother: boolean) => {
    if (!canSave) return;
    const lvl = parseInt(form.level, 10) || 1;
    void save.run(
      () =>
        saveRoadmapItem(
          roadmapId,
          item?.id ?? savedId,
          {
            level: lvl,
            category: form.category,
            title: form.title,
            source: form.source,
            unit: form.unit,
            target: parseInt(form.target, 10) || 1,
            compulsory: form.compulsory,
            sortOrder: item?.sortOrder ?? nextSortOrder(lvl, form.category),
          },
          {
            url: form.url,
            description: form.description,
            imageUrl: form.imageUrl,
          },
        ).then((res) => {
          if (res.error && res.id) setSavedId(res.id);
          return res;
        }),
      () => {
        if (!addAnother) {
          onClose();
          return;
        }
        // Items in one category tend to share a unit and target, so those stay
        // and only what differs is cleared.
        setAdded((a) => ({ title: form.title.trim(), n: (a?.n ?? 0) + 1 }));
        setSavedId(null);
        setForm((f) => ({
          ...f,
          title: "",
          source: "",
          url: "",
          description: "",
          imageUrl: "",
          compulsory: false,
        }));
        titleRef.current?.focus();
      },
    );
  };

  const formId = `item-form-${item?.id ?? "new"}`;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={editing ? "Edit item" : "Add item"}
        description={editing ? item.title : undefined}
        footer={
          <>
            {/* Far from Save so the two can't be mis-tapped, and absent once work
                is recorded because the database would refuse it. */}
            {editing && !item.recorded && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-danger"
                onClick={() => setConfirmingRemove(true)}
              >
                Remove
              </Button>
            )}
            {!editing && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                disabled={!canSave}
                onClick={() => submit(true)}
              >
                Add another
              </Button>
            )}
            {editing && (
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              form={formId}
              variant="primary"
              disabled={!canSave}
            >
              {save.pending ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          className="flex flex-col gap-4 pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div aria-live="polite" className="empty:hidden">
            {added && (
              <p className="rounded-lg bg-primary-container px-3 py-2 text-sm text-on-primary-container">
                Added “{added.title}”.
                {added.n > 1 && ` That's ${added.n} so far.`}
              </p>
            )}
          </div>

          <Field label="Title" htmlFor={`${formId}-title`} required>
            <Input
              ref={titleRef}
              id={`${formId}-title`}
              value={form.title}
              autoComplete="off"
              autoFocus={!editing}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>

          <Field
            label="Source"
            htmlFor={`${formId}-source`}
            hint="Who it is by, or where it is from. Optional."
          >
            <Input
              id={`${formId}-source`}
              value={form.source}
              autoComplete="off"
              onChange={(e) => set("source", e.target.value)}
            />
          </Field>

          <fieldset className="flex min-w-0 flex-col gap-4 rounded-xl bg-muted p-3">
            <legend className="float-left mb-1 flex w-full items-center gap-1.5 text-sm font-semibold text-foreground">
              {frozen && <LockIcon aria-hidden className="size-4" />}
              What counts as done
            </legend>

            <div className="clear-both grid grid-cols-[6rem_1fr] gap-3">
              <Field label="Level" htmlFor={`${formId}-level`}>
                <select
                  id={`${formId}-level`}
                  className={selectCls}
                  disabled={frozen}
                  value={form.level}
                  onChange={(e) => set("level", e.target.value)}
                >
                  {levelChoices.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category" htmlFor={`${formId}-category`}>
                <select
                  id={`${formId}-category`}
                  className={selectCls}
                  disabled={frozen}
                  value={form.category}
                  onChange={(e) => {
                    const category = e.target.value as RoadmapCategory;
                    setForm((f) => ({
                      ...f,
                      category,
                      unit: unitTouched ? f.unit : DEFAULT_UNIT[category],
                    }));
                  }}
                >
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <Field label="Target" htmlFor={`${formId}-target`}>
                <Input
                  id={`${formId}-target`}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  disabled={frozen}
                  value={form.target}
                  onChange={(e) => set("target", e.target.value)}
                />
              </Field>
              <Field label="Unit" htmlFor={`${formId}-unit`} required>
                <Input
                  id={`${formId}-unit`}
                  value={form.unit}
                  autoComplete="off"
                  disabled={frozen}
                  onChange={(e) => {
                    setUnitTouched(true);
                    set("unit", e.target.value);
                  }}
                />
              </Field>
            </div>

            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-primary"
                disabled={frozen}
                checked={form.compulsory}
                onChange={(e) => set("compulsory", e.target.checked)}
              />
              <span className="text-sm text-foreground">
                Required, even once a total is reached
              </span>
            </label>

            {frozen && (
              <p className="text-xs text-muted-foreground">
                Locked because members have recorded work against this item.
                Everything else here can still change.
              </p>
            )}
          </fieldset>

          <Field
            label="Link"
            htmlFor={`${formId}-url`}
            hint="Where a member goes to do this. Optional."
          >
            <Input
              id={`${formId}-url`}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://"
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
            />
          </Field>

          <Field label="Description" htmlFor={`${formId}-description`}>
            <textarea
              id={`${formId}-description`}
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </Field>

          <Field
            label="Picture"
            htmlFor={`${formId}-image`}
            hint={
              editing
                ? "Upload one or paste a link. Blank shows the category's icon."
                : "Paste a link, or upload one after adding the item."
            }
          >
            <div className="flex items-start gap-3">
              {form.imageUrl.trim() !== "" && (
                // Reserves a fixed frame so the form doesn't shift as it loads.
                <span className="h-16 w-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- previewing an arbitrary pasted URL */}
                  <img
                    src={form.imageUrl}
                    alt=""
                    className="size-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                    onLoad={(e) => {
                      e.currentTarget.style.visibility = "";
                    }}
                  />
                </span>
              )}
              <Input
                id={`${formId}-image`}
                autoComplete="off"
                spellCheck={false}
                value={form.imageUrl}
                onChange={(e) => set("imageUrl", e.target.value)}
                className="min-w-0 flex-1"
              />
            </div>
          </Field>
          {editing && (
            <CoverUpload
              itemId={item.id}
              onUploaded={(url) => set("imageUrl", url)}
              disabled={save.pending}
            />
          )}

          {(save.error || remove.error) && (
            <p role="alert" className="text-sm text-danger">
              {save.error ?? remove.error}
            </p>
          )}
        </form>
      </Dialog>

      {editing && (
        <ConfirmDialog
          open={confirmingRemove}
          onClose={() => setConfirmingRemove(false)}
          title="Remove this item?"
          description={`“${item.title}” comes off the roadmap. Nobody has recorded anything against it.`}
          confirmLabel="Remove"
          onConfirm={() =>
            void remove.run(
              () => deleteRoadmapItem(item.id),
              () => {
                setConfirmingRemove(false);
                onClose();
              },
            )
          }
        />
      )}
    </>
  );
}

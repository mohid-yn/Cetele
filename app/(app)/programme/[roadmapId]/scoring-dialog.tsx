"use client";

import * as React from "react";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { setRoadmapLevelRequirement } from "./authoring-actions";

/**
 * How one category at one level is finished: every item, or a total chosen from
 * a menu (the booklet's "listen to 600 minutes"). The database has supported this
 * since D55, but no screen could set it, so it could only change by migration.
 */
export function ScoringDialog({
  open,
  onClose,
  roadmapId,
  level,
  category,
  categoryLabel,
  unit,
  available,
  itemCount,
  minTotal,
}: {
  open: boolean;
  onClose: () => void;
  roadmapId: string;
  level: number;
  category: string;
  categoryLabel: string;
  unit: string;
  /** What this category's items add up to, in `unit`. */
  available: number;
  itemCount: number;
  minTotal: number | null;
}) {
  const [mode, setMode] = React.useState<"all" | "total">(
    minTotal == null ? "all" : "total",
  );
  const [total, setTotal] = React.useState(String(minTotal ?? available));
  const act = useAction();

  const parsed = parseInt(total, 10);
  const invalid = mode === "total" && !(parsed >= 1);
  const tooHigh = mode === "total" && parsed > available;
  const name = `scoring-${level}-${category}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`How is ${categoryLabel} finished?`}
      description={`Level ${level}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={act.pending || invalid || tooHigh}
            onClick={() =>
              void act.run(
                () =>
                  setRoadmapLevelRequirement(
                    roadmapId,
                    level,
                    category,
                    mode === "all" ? null : parsed,
                  ),
                onClose,
              )
            }
          >
            {act.pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 pb-1">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-surface-hover">
          <input
            type="radio"
            name={name}
            className="mt-0.5 size-5 shrink-0 accent-primary"
            checked={mode === "all"}
            onChange={() => setMode("all")}
          />
          <span className="text-sm text-foreground">
            <span className="block font-medium">Finish every item</span>
            <span className="text-muted-foreground">
              All {itemCount} {itemCount === 1 ? "item" : "items"}.
            </span>
          </span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-surface-hover">
          <input
            type="radio"
            name={name}
            className="mt-0.5 size-5 shrink-0 accent-primary"
            checked={mode === "total"}
            onChange={() => setMode("total")}
          />
          <span className="text-sm text-foreground">
            <span className="block font-medium">Reach a total</span>
            <span className="text-muted-foreground">
              Members choose which items add up to it. Required items still
              count as required.
            </span>
          </span>
        </label>

        {mode === "total" && (
          <Field
            label={`Total ${unit}`}
            htmlFor={`${name}-total`}
            className="mt-2 pl-10"
            error={
              tooHigh
                ? `The items only add up to ${available} ${unit}.`
                : undefined
            }
            hint={`The items add up to ${available} ${unit}.`}
          >
            <Input
              id={`${name}-total`}
              type="number"
              min={1}
              inputMode="numeric"
              className="w-32"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </Field>
        )}

        {act.error && (
          <p role="alert" className="text-sm text-danger">
            {act.error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

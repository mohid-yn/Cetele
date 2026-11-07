"use client";

import * as React from "react";
import { Button, ConfirmDialog } from "@/components/ui";
import { SectionHeading } from "@/components/app/section-heading";
import { useAction } from "@/lib/use-action";
import { deleteCamp, deleteSeries, setCampCancelled } from "./actions";

/**
 * What can be done to a camp besides editing it (D87), at the foot of its
 * admin page, each with the consequence said before it happens:
 *
 *   draft      Delete (nobody has seen it)
 *   published  Cancel (members see it marked, answers kept) · Delete
 *   cancelled  Restore · Delete
 */
export function CampActions({
  eventId,
  branchId,
  status,
}: {
  eventId: string;
  branchId: string;
  status: "draft" | "published" | "cancelled";
}) {
  const [ask, setAsk] = React.useState<"cancel" | "delete" | null>(null);
  const act = useAction();

  return (
    <section>
      <SectionHeading>Camp</SectionHeading>
      <div className="flex flex-wrap gap-2">
        {status === "published" && (
          <Button
            variant="outline"
            disabled={act.pending}
            onClick={() => setAsk("cancel")}
          >
            Cancel the camp
          </Button>
        )}
        {status === "cancelled" && (
          <Button
            variant="tonal"
            disabled={act.pending}
            onClick={() => void act.run(() => setCampCancelled(eventId, false))}
          >
            Restore the camp
          </Button>
        )}
        <Button
          variant="destructive-outline"
          disabled={act.pending}
          onClick={() => setAsk("delete")}
        >
          {status === "draft" ? "Delete draft" : "Delete the camp"}
        </Button>
      </div>
      {act.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {act.error}
        </p>
      )}

      <ConfirmDialog
        open={ask === "cancel"}
        onClose={() => setAsk(null)}
        title="Cancel the camp?"
        description="Everyone it reaches sees it marked cancelled. Their answers are kept, and you can restore it."
        confirmLabel="Cancel it"
        onConfirm={() => {
          setAsk(null);
          void act.run(() => setCampCancelled(eventId, true));
        }}
      />
      <ConfirmDialog
        open={ask === "delete"}
        onClose={() => setAsk(null)}
        title={status === "draft" ? "Delete this draft?" : "Delete the camp?"}
        description={
          status === "draft"
            ? "Nobody else has seen it."
            : "It disappears for everyone, with every answer and poll. To keep a record, cancel it instead."
        }
        confirmLabel="Delete"
        onConfirm={() => {
          setAsk(null);
          void act.run(() => deleteCamp(eventId, branchId));
        }}
      />
    </section>
  );
}

/**
 * Deleting a weekly halaqah as a whole (D87). Stopping it, in the form above,
 * keeps its past weeks; this removes them all.
 */
export function SeriesDelete({
  seriesId,
  branchId,
  title,
}: {
  seriesId: string;
  branchId: string;
  title: string;
}) {
  const [ask, setAsk] = React.useState(false);
  const act = useAction();
  return (
    <section>
      <SectionHeading>Halaqah</SectionHeading>
      <Button
        variant="destructive-outline"
        disabled={act.pending}
        onClick={() => setAsk(true)}
      >
        Delete this halaqah
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        To pause it and keep its past weeks, stop it instead.
      </p>
      {act.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {act.error}
        </p>
      )}
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        title={`Delete ${title}?`}
        description="Every week goes, past and coming, with its answers, polls and questions. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          setAsk(false);
          void act.run(() => deleteSeries(seriesId, branchId));
        }}
      />
    </section>
  );
}

"use client";

import * as React from "react";
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Textarea,
} from "@/components/ui";
import { selectCls } from "@/components/app/role-toggle";
import { useAction } from "@/lib/use-action";
import { isoToVenueLocal, venueLocalToISO } from "@/lib/events";
import { deleteDraft, saveCamp, type CampInput } from "./actions";
import { ZoneInput } from "./zone-input";

export type BranchOption = { id: string; label: string };

/**
 * A camp, new or edited (D80).
 *
 * TIMES ARE TYPED AS THE VENUE'S CLOCK. A steward in Melbourne posting a
 * Brisbane camp types "Friday 6pm" meaning 6pm in Brisbane, so the zone field
 * sits beside the times and every time is resolved against it on save.
 *
 * Two saves: a draft (only stewards see it) and Publish. Once published there
 * is no way back to a draft, only Cancel, on the event's own screen.
 */
export function CampForm({
  branches,
  initial,
  defaultZone,
}: {
  branches: BranchOption[];
  initial: CampInput | null;
  defaultZone: string;
}) {
  const zone0 = initial?.timezone ?? defaultZone;
  const [form, setForm] = React.useState(() => ({
    branchId: initial?.branchId ?? branches[0]?.id ?? "",
    title: initial?.title ?? "",
    details: initial?.details ?? "",
    venue: initial?.venue ?? "",
    timezone: zone0,
    starts: initial ? isoToVenueLocal(initial.startsAt, zone0) : "",
    ends: initial ? isoToVenueLocal(initial.endsAt, zone0) : "",
    closes: initial?.rsvpClosesAt
      ? isoToVenueLocal(initial.rsvpClosesAt, zone0)
      : "",
    capacity: initial?.capacity != null ? String(initial.capacity) : "",
  }));
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const act = useAction();
  const del = useAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const status = initial?.status ?? "draft";
  const endsBeforeStart = form.starts && form.ends && form.ends <= form.starts;
  const ready =
    form.branchId &&
    form.title.trim() &&
    form.starts &&
    form.ends &&
    !endsBeforeStart;

  const save = (next: CampInput["status"]) =>
    act.run(async () => {
      let input: CampInput;
      try {
        input = {
          id: initial?.id ?? null,
          branchId: form.branchId,
          title: form.title,
          details: form.details,
          venue: form.venue,
          timezone: form.timezone,
          startsAt: venueLocalToISO(form.starts, form.timezone),
          endsAt: venueLocalToISO(form.ends, form.timezone),
          rsvpClosesAt: form.closes
            ? venueLocalToISO(form.closes, form.timezone)
            : null,
          capacity: form.capacity ? Number(form.capacity) : null,
          status: next,
        };
      } catch {
        return { error: "Check the dates and the time zone." };
      }
      return (await saveCamp(input)) ?? { error: null };
    });

  return (
    <Card className="flex flex-col gap-4 p-4">
      <Field
        label="Branch"
        htmlFor="camp-branch"
        hint="Every circle in it, and in the branches inside it, will see this."
      >
        <select
          id="camp-branch"
          className={selectCls + " w-full"}
          value={form.branchId}
          onChange={(e) => set("branchId", e.target.value)}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title" htmlFor="camp-title" required>
        <Input
          id="camp-title"
          value={form.title}
          maxLength={120}
          placeholder="Winter camp"
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <Field label="Where" htmlFor="camp-venue">
        <Input
          id="camp-venue"
          value={form.venue}
          maxLength={300}
          placeholder="Address or place name"
          onChange={(e) => set("venue", e.target.value)}
        />
      </Field>
      <ZoneInput
        id="camp-zone"
        value={form.timezone}
        onChange={(v) => set("timezone", v)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts" htmlFor="camp-starts" required>
          <Input
            id="camp-starts"
            type="datetime-local"
            value={form.starts}
            onChange={(e) => set("starts", e.target.value)}
          />
        </Field>
        <Field
          label="Ends"
          htmlFor="camp-ends"
          required
          error={endsBeforeStart ? "Must be after it starts." : undefined}
        >
          <Input
            id="camp-ends"
            type="datetime-local"
            value={form.ends}
            onChange={(e) => set("ends", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Replies close"
          htmlFor="camp-closes"
          hint="Optional. Otherwise when the camp ends."
        >
          <Input
            id="camp-closes"
            type="datetime-local"
            value={form.closes}
            onChange={(e) => set("closes", e.target.value)}
          />
        </Field>
        <Field
          label="Places"
          htmlFor="camp-capacity"
          hint="Optional. Leave empty for no limit."
        >
          <Input
            id="camp-capacity"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.capacity}
            onChange={(e) => set("capacity", e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Details"
        htmlFor="camp-details"
        hint="What to bring, cost, who to contact."
      >
        <Textarea
          id="camp-details"
          rows={5}
          maxLength={4000}
          value={form.details}
          onChange={(e) => set("details", e.target.value)}
        />
      </Field>

      {act.error && (
        <p role="alert" className="text-sm text-danger">
          {act.error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {initial && status === "draft" && (
          <Button
            variant="destructive-outline"
            onClick={() => setConfirmDelete(true)}
          >
            Delete draft
          </Button>
        )}
        {status === "draft" && (
          <Button
            variant="outline"
            disabled={!ready || act.pending}
            onClick={() => void save("draft")}
          >
            Save draft
          </Button>
        )}
        <Button
          variant={status === "draft" ? "accent" : "primary"}
          disabled={!ready || act.pending}
          onClick={() => void save(status === "draft" ? "published" : status)}
        >
          {act.pending
            ? "Saving…"
            : status === "draft"
              ? "Publish"
              : "Save changes"}
        </Button>
      </div>
      {del.error && (
        <p role="alert" className="text-sm text-danger">
          {del.error}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this draft?"
        description="Nobody else has seen it."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          if (initial?.id) void del.run(() => deleteDraft(initial.id!));
        }}
      />
    </Card>
  );
}

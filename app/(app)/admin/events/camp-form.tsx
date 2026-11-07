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
import { SectionHeading } from "@/components/app/section-heading";
import { ChevronDownIcon, CloseIcon, PlusIcon } from "@/components/app/icons";
import { selectCls } from "@/components/app/role-toggle";
import { cn } from "@/lib/utils";
import { useAction } from "@/lib/use-action";
import {
  campDays,
  cleanSchedule,
  isoToVenueLocal,
  venueLocalToISO,
  type ScheduleRow,
} from "@/lib/events";
import { deleteDraft, saveCamp, type CampInput } from "./actions";
import { ZoneInput } from "./zone-input";

export type BranchOption = {
  id: string;
  label: string;
  name: string;
  /** Circles an event here reaches: the branch and everything inside it. */
  circles: number;
};

/**
 * A camp, new or edited (D80, D84).
 *
 * Laid out as the questions a member will ask, in order: who is it for, when
 * and where, how do I sign up and what does it cost, what do I bring, what
 * happens each day, who do I ask. Each is its own section so nothing hides in a
 * paragraph (owner, 2026-11-07).
 *
 * TIMES ARE TYPED AS THE VENUE'S CLOCK. A steward in Melbourne posting a
 * Brisbane camp types "Friday 6pm" meaning 6pm in Brisbane, so the zone field
 * sits beside the times and every time is resolved against it on save.
 *
 * Two saves: a draft (only stewards see it) and Publish. Once published there
 * is no way back to a draft, only Cancel, on the event's own screen.
 */
export function CampForm({
  branch,
  initial,
  defaultZone,
}: {
  /**
   * The branch it belongs to, fixed (D85): a camp is started from inside its
   * branch, so the form never asks which one.
   */
  branch: BranchOption;
  initial: CampInput | null;
  defaultZone: string;
}) {
  const zone0 = initial?.timezone ?? defaultZone;
  const [form, setForm] = React.useState(() => ({
    branchId: branch.id,
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
    cost: initial?.cost ?? "",
    bring: initial?.bring.length ? initial.bring : [""],
    contactName: initial?.contactName ?? "",
    contactDetail: initial?.contactDetail ?? "",
    schedule: initial?.schedule ?? ([] as ScheduleRow[]),
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

  // The camp's days on the venue's calendar, for the schedule's day picker.
  const days = React.useMemo(() => {
    if (!form.starts || !form.ends || endsBeforeStart) return [];
    try {
      return campDays(
        venueLocalToISO(form.starts, form.timezone),
        venueLocalToISO(form.ends, form.timezone),
        form.timezone,
      );
    } catch {
      return [];
    }
  }, [form.starts, form.ends, form.timezone, endsBeforeStart]);

  // The optional sections open on tap (D85), and say what they hold when shut.
  const bringCount = form.bring.filter((b) => b.trim()).length;
  const hasBring = bringCount > 0;
  const bringSummary = hasBring
    ? `${bringCount} ${bringCount === 1 ? "thing" : "things"}`
    : "Add";
  const hasSchedule = form.schedule.length > 0;
  const scheduleSummary = hasSchedule
    ? `${form.schedule.length} ${form.schedule.length === 1 ? "line" : "lines"}`
    : "Add";
  const hasContact = Boolean(
    form.contactName.trim() || form.contactDetail.trim(),
  );
  const contactSummary = hasContact
    ? form.contactName.trim() || form.contactDetail.trim()
    : "Add";
  const hasDetails = Boolean(form.details.trim());
  const detailsSummary = hasDetails ? "Written" : "Add";

  const setRow = (i: number, patch: Partial<ScheduleRow>) =>
    set(
      "schedule",
      form.schedule.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );
  const addRow = () => {
    const last = form.schedule.at(-1);
    set("schedule", [
      ...form.schedule,
      { day: last?.day ?? 1, time: "", label: "" },
    ]);
  };

  const save = (next: CampInput["status"]) =>
    act.run(async () => {
      const sched = cleanSchedule(form.schedule);
      if (sched.error) return { error: sched.error };
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
          cost: form.cost,
          bring: form.bring.map((b) => b.trim()).filter(Boolean),
          contactName: form.contactName,
          contactDetail: form.contactDetail,
          schedule: sched.rows,
        };
      } catch {
        return { error: "Check the dates and the time zone." };
      }
      return (await saveCamp(input)) ?? { error: null };
    });

  return (
    <div className="flex flex-col gap-6">
      {/* 2. When and where -------------------------------------------------- */}
      <section>
        <SectionHeading>When and where</SectionHeading>
        <Card className="flex flex-col gap-3 p-4">
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
        </Card>
      </section>

      {/* 3. Signing up ------------------------------------------------------ */}
      <section>
        <SectionHeading>Signing up</SectionHeading>
        <Card className="flex flex-col gap-3 p-4">
          <Field
            label="Cost"
            htmlFor="camp-cost"
            hint="Leave empty if it is free. E.g. “$120, siblings $90”."
          >
            <Input
              id="camp-cost"
              value={form.cost}
              maxLength={80}
              placeholder="Free"
              onChange={(e) => set("cost", e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Places"
              htmlFor="camp-capacity"
              hint="Leave empty for no limit."
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
            <Field
              label="Replies close"
              htmlFor="camp-closes"
              hint="Otherwise when the camp ends."
            >
              <Input
                id="camp-closes"
                type="datetime-local"
                value={form.closes}
                onChange={(e) => set("closes", e.target.value)}
              />
            </Field>
          </div>
        </Card>
      </section>

      {/* 4. What to bring --------------------------------------------------- */}
      <Optional
        title="What to bring"
        summary={bringSummary}
        defaultOpen={hasBring}
      >
        <div className="flex flex-col gap-2 p-4">
          {form.bring.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                aria-label={`Thing to bring ${i + 1}`}
                value={item}
                maxLength={120}
                placeholder={i === 0 ? "Sleeping bag" : "Another thing"}
                onChange={(e) =>
                  set(
                    "bring",
                    form.bring.map((b, j) => (j === i ? e.target.value : b)),
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    set("bring", [...form.bring, ""]);
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${item || "this line"}`}
                onClick={() =>
                  set(
                    "bring",
                    form.bring.length > 1
                      ? form.bring.filter((_, j) => j !== i)
                      : [""],
                  )
                }
              >
                <CloseIcon aria-hidden className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="tonal"
            size="sm"
            className="self-start"
            disabled={form.bring.length >= 40}
            onClick={() => set("bring", [...form.bring, ""])}
          >
            <PlusIcon aria-hidden className="size-4" /> Add a thing
          </Button>
        </div>
      </Optional>

      {/* 5. Schedule -------------------------------------------------------- */}
      <Optional
        title="Schedule"
        summary={scheduleSummary}
        defaultOpen={hasSchedule}
      >
        <div className="flex flex-col gap-2 p-4">
          {form.schedule.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Optional. What happens each day, e.g. &ldquo;Day 1 · 18:00 ·
              Dinner and welcome&rdquo;.
            </p>
          )}
          {form.schedule.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,7rem)_6.5rem_minmax(0,1fr)_auto] items-center gap-2"
            >
              <select
                aria-label={`Day for line ${i + 1}`}
                className={selectCls + " w-full"}
                value={r.day}
                onChange={(e) => setRow(i, { day: Number(e.target.value) })}
              >
                {Array.from(
                  { length: Math.max(days.length, r.day, 1) },
                  (_, d) => (
                    <option key={d + 1} value={d + 1}>
                      {days[d] ? `Day ${d + 1} · ${days[d]}` : `Day ${d + 1}`}
                    </option>
                  ),
                )}
              </select>
              <Input
                aria-label={`Time for line ${i + 1}`}
                type="time"
                value={r.time}
                onChange={(e) => setRow(i, { time: e.target.value })}
              />
              <Input
                aria-label={`What happens, line ${i + 1}`}
                value={r.label}
                maxLength={120}
                placeholder="Activity"
                onChange={(e) => setRow(i, { label: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove line ${i + 1}`}
                onClick={() =>
                  set(
                    "schedule",
                    form.schedule.filter((_, j) => j !== i),
                  )
                }
              >
                <CloseIcon aria-hidden className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="tonal"
            size="sm"
            className="self-start"
            disabled={form.schedule.length >= 80}
            onClick={addRow}
          >
            <PlusIcon aria-hidden className="size-4" /> Add a line
          </Button>
        </div>
      </Optional>

      {/* 6. Contact --------------------------------------------------------- */}
      <Optional
        title="Who to ask"
        summary={contactSummary}
        defaultOpen={hasContact}
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="camp-contact-name">
            <Input
              id="camp-contact-name"
              value={form.contactName}
              maxLength={80}
              placeholder="Br Yusuf"
              onChange={(e) => set("contactName", e.target.value)}
            />
          </Field>
          <Field
            label="Phone or email"
            htmlFor="camp-contact-detail"
            hint="Everyone the camp reaches can see this."
          >
            <Input
              id="camp-contact-detail"
              value={form.contactDetail}
              maxLength={120}
              onChange={(e) => set("contactDetail", e.target.value)}
            />
          </Field>
        </div>
      </Optional>

      {/* 7. Anything else --------------------------------------------------- */}
      <Optional
        title="Anything else"
        summary={detailsSummary}
        defaultOpen={hasDetails}
      >
        <div className="p-4">
          <Field
            label="Details"
            htmlFor="camp-details"
            hint="Who it suits, permission forms, transport."
          >
            <Textarea
              id="camp-details"
              rows={4}
              maxLength={4000}
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
            />
          </Field>
        </div>
      </Optional>

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
              ? `Publish to ${branch.circles} ${branch.circles === 1 ? "circle" : "circles"}`
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
          if (initial?.id)
            void del.run(() => deleteDraft(initial.id!, branch.id));
        }}
      />
    </div>
  );
}

/**
 * A section that stays one row until it is wanted (D85): optional detail opens
 * on tap instead of filling the screen. Open from the start when it already
 * holds something, so an edit never hides what is there.
 */
function Optional({
  title,
  summary,
  defaultOpen,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const id = React.useId();
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          {!open && summary}
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-4 transition-transform duration-[var(--duration-fast)]",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      {open && (
        <div id={id} className="border-t border-border">
          {children}
        </div>
      )}
    </Card>
  );
}

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
import { SectionHeading } from "@/components/app/section-heading";
import { useAction } from "@/lib/use-action";
import { WEEKDAY_NAMES } from "@/lib/events";
import {
  appointHost,
  removeHost,
  saveSeries,
  type SeriesInput,
} from "./actions";
import { ZoneInput } from "./zone-input";
import type { BranchOption } from "./camp-form";

/**
 * A weekly halaqah (D80). Saving lays out the next six weeks as sessions, and
 * a daily job keeps six weeks ahead. Each session gets its own polls and
 * questions.
 *
 * Changing the day or time moves every week nobody has touched. A week with an
 * answer, a poll or a question keeps its slot, so nobody's answer moves to a
 * time they did not agree to.
 */
export function SeriesForm({
  branches,
  initial,
  defaultZone,
}: {
  branches: BranchOption[];
  initial: SeriesInput | null;
  defaultZone: string;
}) {
  const [form, setForm] = React.useState(() => ({
    branchId: initial?.branchId ?? branches[0]?.id ?? "",
    title: initial?.title ?? "",
    details: initial?.details ?? "",
    venue: initial?.venue ?? "",
    weekday: initial?.weekday ?? 4,
    startTime: initial?.startTime?.slice(0, 5) ?? "19:00",
    duration: String(initial?.durationMinutes ?? 90),
    timezone: initial?.timezone ?? defaultZone,
  }));
  const [confirmOff, setConfirmOff] = React.useState(false);
  const act = useAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const active = initial?.active ?? true;
  const ready =
    form.branchId &&
    form.title.trim() &&
    form.startTime &&
    Number(form.duration) >= 15;

  const save = (nextActive: boolean) =>
    act.run(
      async () =>
        (await saveSeries({
          id: initial?.id ?? null,
          branchId: form.branchId,
          title: form.title,
          details: form.details,
          venue: form.venue,
          weekday: form.weekday,
          startTime: form.startTime,
          durationMinutes: Number(form.duration),
          timezone: form.timezone,
          active: nextActive,
        })) ?? { error: null },
    );

  return (
    <Card className="flex flex-col gap-4 p-4">
      <Field
        label="Branch"
        htmlFor="series-branch"
        hint="Every circle in it, and in the branches inside it, will see this."
      >
        <select
          id="series-branch"
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
      <Field label="Title" htmlFor="series-title" required>
        <Input
          id="series-title"
          value={form.title}
          maxLength={120}
          placeholder="Thursday night halaqah"
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <Field label="Where" htmlFor="series-venue">
        <Input
          id="series-venue"
          value={form.venue}
          maxLength={300}
          onChange={(e) => set("venue", e.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Every" htmlFor="series-day">
          <select
            id="series-day"
            className={selectCls + " w-full"}
            value={form.weekday}
            onChange={(e) => set("weekday", Number(e.target.value))}
          >
            {WEEKDAY_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="At" htmlFor="series-time">
          <Input
            id="series-time"
            type="time"
            value={form.startTime}
            onChange={(e) => set("startTime", e.target.value)}
          />
        </Field>
        <Field label="Minutes" htmlFor="series-duration">
          <Input
            id="series-duration"
            type="number"
            inputMode="numeric"
            min={15}
            max={720}
            value={form.duration}
            onChange={(e) => set("duration", e.target.value)}
          />
        </Field>
      </div>
      <ZoneInput
        id="series-zone"
        value={form.timezone}
        onChange={(v) => set("timezone", v)}
      />
      <Field label="Details" htmlFor="series-details">
        <Textarea
          id="series-details"
          rows={4}
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
        {initial &&
          (active ? (
            <Button
              variant="destructive-outline"
              onClick={() => setConfirmOff(true)}
            >
              Stop the series
            </Button>
          ) : (
            <Button
              variant="tonal"
              disabled={act.pending}
              onClick={() => void save(true)}
            >
              Start it again
            </Button>
          ))}
        <Button
          variant={initial ? "primary" : "accent"}
          disabled={!ready || act.pending}
          onClick={() => void save(active)}
        >
          {act.pending ? "Saving…" : initial ? "Save changes" : "Publish"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title="Stop this halaqah?"
        description="Every session still to come is cancelled. Past sessions and their questions stay. You can start it again."
        confirmLabel="Stop it"
        onConfirm={() => {
          setConfirmOff(false);
          void save(false);
        }}
      />
    </Card>
  );
}

export type Host = { userId: string; name: string | null; email: string };

/** Who leads it: they run its polls and read its questions. No RSVP names. */
export function Hosts({
  seriesId,
  hosts,
}: {
  seriesId: string;
  hosts: Host[];
}) {
  const [email, setEmail] = React.useState("");
  const add = useAction();
  const remove = useAction();
  return (
    <section>
      <SectionHeading>Hosts</SectionHeading>
      <p className="mb-2 text-xs text-muted-foreground">
        A host runs the weekly polls and sees the questions. They do not see who
        is coming.
      </p>
      {hosts.length > 0 && (
        <Card className="mb-3 overflow-hidden">
          <ul className="flex flex-col divide-y divide-border">
            {hosts.map((h) => (
              <li key={h.userId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {h.name ?? "Unnamed"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {h.email}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.pending}
                  onClick={() =>
                    void remove.run(() => removeHost(seriesId, h.userId))
                  }
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
          void add.run(
            () => appointHost(seriesId, email),
            () => setEmail(""),
          );
        }}
      >
        <Field
          label="Add a host"
          htmlFor="host-email"
          hint="Their exact email address."
          className="flex-1"
        >
          <Input
            id="host-email"
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
          disabled={!email.trim() || add.pending}
        >
          Add
        </Button>
      </form>
      {(add.error || remove.error) && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {add.error ?? remove.error}
        </p>
      )}
    </section>
  );
}

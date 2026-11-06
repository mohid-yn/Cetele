"use client";

import * as React from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Screen,
  Textarea,
} from "@/components/ui";
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  CalendarIcon,
  CheckIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  QuestionIcon,
} from "@/components/app/icons";
import { SectionHeading } from "@/components/app/section-heading";
import { Segmented } from "@/components/app/segmented";
import { RsvpButtons } from "@/components/app/event-rsvp";
import { cn } from "@/lib/utils";
import { useAction } from "@/lib/use-action";
import { forgetUpcoming } from "@/lib/upcoming-cache";
import {
  formatMoment,
  formatWhen,
  needsZoneLabel,
  POLL_KINDS,
  repliesOpen,
  zoneCity,
  type PollKind,
  type RsvpStatus,
} from "@/lib/events";
import {
  askQuestion,
  createPoll,
  deleteMyQuestion,
  deletePoll,
  setCancelled,
  setQuestionState,
  setRsvp,
  upvoteQuestion,
  vote,
  type PollRow,
  type QuestionRow,
} from "../actions";

export type EventDetail = {
  id: string;
  kind: "camp" | "halaqah";
  title: string;
  details: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: "draft" | "published" | "cancelled";
  branchName: string;
  seriesId: string | null;
  rsvpClosesAt: string | null;
  capacity: number | null;
  myStatus: RsvpStatus | null;
  myNote: string;
  going: number;
  maybe: number;
  no: number;
  canLead: boolean;
  canSteward: boolean;
};

export type Attendee = {
  userId: string;
  name: string;
  status: RsvpStatus;
  note: string;
};

export function EventDetailClient({
  event,
  polls: initialPolls,
  questions: initialQuestions,
  attendees,
  viewerZone,
  nowISO,
}: {
  event: EventDetail;
  polls: PollRow[];
  questions: QuestionRow[];
  attendees: Attendee[];
  viewerZone: string;
  nowISO: string;
}) {
  const now = new Date(nowISO);
  const [counts, setCounts] = React.useState({
    going: event.going,
    maybe: event.maybe,
    status: event.myStatus,
  });
  const cancelled = event.status === "cancelled";
  const open = repliesOpen(event, now);
  const full =
    event.capacity != null &&
    counts.going >= event.capacity &&
    counts.status !== "going";
  const ended = new Date(event.endsAt).getTime() <= now.getTime();

  return (
    <Screen>
      <div className="flex flex-col gap-3">
        <Link
          href="/events"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary"
        >
          <ArrowLeftIcon aria-hidden className="size-4" /> Events
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={event.kind === "camp" ? "accent" : "primary"}
            size="sm"
          >
            {event.kind === "camp" ? "Camp" : "Halaqah"}
          </Badge>
          <span className="text-xs font-medium text-muted-foreground">
            {event.branchName}
          </span>
          {cancelled && (
            <Badge variant="danger" size="sm">
              Cancelled
            </Badge>
          )}
          {event.status === "draft" && (
            <Badge variant="warning" size="sm">
              Draft, only leaders can see it
            </Badge>
          )}
        </div>
        <h1
          className={cn(
            "font-display text-2xl font-bold",
            cancelled
              ? "text-muted-foreground line-through"
              : "text-foreground",
          )}
        >
          {event.title}
        </h1>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarIcon aria-hidden className="size-4 shrink-0" />
            {formatWhen(event.startsAt, event.endsAt, event.timezone)}
            {needsZoneLabel(event.startsAt, event.timezone, viewerZone) &&
              ` (${zoneCity(event.timezone)} time)`}
          </span>
          {event.venue && (
            <span className="flex items-center gap-1.5">
              <PinIcon aria-hidden className="size-4 shrink-0" />
              {event.venue}
            </span>
          )}
        </div>
        {event.details && (
          <p className="text-sm whitespace-pre-line text-foreground">
            {event.details}
          </p>
        )}
      </div>

      {!cancelled && event.status !== "draft" && (
        <section>
          <SectionHeading
            action={
              <span>
                <span className="font-semibold text-foreground tabular-nums">
                  {counts.going}
                </span>{" "}
                going
                {counts.maybe > 0 && ` · ${counts.maybe} maybe`}
                {event.capacity != null &&
                  ` · ${Math.max(0, event.capacity - counts.going)} places left`}
              </span>
            }
          >
            Are you coming?
          </SectionHeading>
          {open ? (
            <RsvpButtons
              eventId={event.id}
              value={counts.status}
              full={full}
              size="md"
              onChange={(next, prev) =>
                setCounts((c) => ({
                  status: next,
                  going:
                    c.going +
                    (next === "going" ? 1 : 0) -
                    (prev === "going" ? 1 : 0),
                  maybe:
                    c.maybe +
                    (next === "maybe" ? 1 : 0) -
                    (prev === "maybe" ? 1 : 0),
                }))
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {counts.status
                ? `Replies have closed. You said ${counts.status === "no" ? "you can't make it" : counts.status}.`
                : "Replies have closed."}
            </p>
          )}
          {event.kind === "camp" &&
            open &&
            (counts.status === "going" || counts.status === "maybe") && (
              <RsvpNote
                eventId={event.id}
                status={counts.status}
                initial={event.myNote}
              />
            )}
          {event.rsvpClosesAt && open && (
            <p className="mt-2 text-xs text-muted-foreground">
              Replies close {formatMoment(event.rsvpClosesAt, event.timezone)}.
            </p>
          )}
        </section>
      )}

      {event.status !== "draft" && (
        <Polls
          eventId={event.id}
          initial={initialPolls}
          canLead={event.canLead && !ended}
          live={event.status === "published"}
          now={now}
        />
      )}

      {/* Questions are for a session someone leads, not a camp. */}
      {event.status !== "draft" && event.kind === "halaqah" && (
        <Questions
          eventId={event.id}
          initial={initialQuestions}
          canLead={event.canLead}
          canAsk={event.status === "published" && !ended}
        />
      )}

      {event.canSteward && <StewardTools event={event} attendees={attendees} />}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// A note with the answer (camps): dietary needs and the like
// ---------------------------------------------------------------------------

function RsvpNote({
  eventId,
  status,
  initial,
}: {
  eventId: string;
  status: RsvpStatus;
  initial: string;
}) {
  const [note, setNote] = React.useState(initial);
  const [saved, setSaved] = React.useState(initial);
  const act = useAction();
  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void act.run(
          async () => {
            const res = await setRsvp(eventId, status, note);
            return { error: res.error };
          },
          () => setSaved(note.trim()),
        );
      }}
    >
      <Field
        label="Anything the organisers should know?"
        htmlFor="rsvp-note"
        hint="Dietary needs, arriving late. Only the organisers see this."
      >
        <Input
          id="rsvp-note"
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {note.trim() !== saved && (
        <Button
          type="submit"
          size="sm"
          variant="tonal"
          disabled={act.pending}
          className="self-start"
        >
          {act.pending ? "Saving…" : "Save note"}
        </Button>
      )}
      {act.error && (
        <p role="alert" className="text-xs text-danger">
          {act.error}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Polls
// ---------------------------------------------------------------------------

function Polls({
  eventId,
  initial,
  canLead,
  live,
  now,
}: {
  eventId: string;
  initial: PollRow[];
  canLead: boolean;
  live: boolean;
  now: Date;
}) {
  const [polls, setPolls] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  if (polls.length === 0 && !canLead) return null;

  const run = async (
    key: string,
    fn: () => Promise<{ data: PollRow[]; error: string | null }>,
  ) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        setPolls(res.data);
        // Today's card asks for a vote until one is cast.
        forgetUpcoming();
      }
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="polls" className="scroll-mt-6">
      <SectionHeading
        action={
          canLead && !creating ? (
            <Button size="sm" variant="tonal" onClick={() => setCreating(true)}>
              <PlusIcon aria-hidden className="size-4" /> New poll
            </Button>
          ) : undefined
        }
      >
        Polls
      </SectionHeading>

      {creating && (
        <NewPoll
          onCancel={() => setCreating(false)}
          onCreate={async (kind, question, options) => {
            await run("new", () =>
              createPoll(eventId, kind, question, options),
            );
            setCreating(false);
          }}
          pending={busy === "new"}
        />
      )}

      <div className="flex flex-col gap-3">
        {polls.map((p) => {
          const total = p.options.reduce((n, o) => n + o.votes, 0);
          const closed =
            !live || new Date(p.closesAt).getTime() <= now.getTime();
          const voted = p.options.some((o) => o.mine);
          return (
            <Card key={p.pollId} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Badge variant="neutral" size="sm">
                    {POLL_KINDS[p.kind as PollKind] ?? "Poll"}
                  </Badge>
                  <p className="mt-1.5 font-medium text-foreground">
                    {p.question}
                  </p>
                </div>
                {canLead && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === p.pollId}
                    onClick={() =>
                      void run(p.pollId, () => deletePoll(eventId, p.pollId))
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
              <ul className="flex flex-col gap-1.5">
                {p.options.map((o) => {
                  const pct = total ? Math.round((o.votes / total) * 100) : 0;
                  // Results show once you have voted or the poll has closed,
                  // so the first votes do not steer the rest.
                  const reveal = voted || closed || canLead;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        disabled={closed || busy === p.pollId}
                        aria-pressed={o.mine}
                        onClick={() =>
                          void run(p.pollId, () =>
                            vote(eventId, p.pollId, o.mine ? null : o.id),
                          )
                        }
                        className={cn(
                          "relative isolate flex min-h-11 w-full items-center justify-between gap-2 overflow-hidden rounded-lg border px-3 text-left text-sm transition-colors duration-[var(--duration-fast)]",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          o.mine
                            ? "border-primary font-semibold text-foreground"
                            : "border-border text-foreground hover:bg-surface-hover",
                          closed && "cursor-default",
                        )}
                      >
                        {reveal && (
                          <span
                            aria-hidden
                            className={cn(
                              "absolute inset-y-0 left-0 -z-10",
                              o.mine ? "bg-primary-100" : "bg-muted",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        )}
                        <span className="flex items-center gap-1.5">
                          {o.mine && (
                            <CheckIcon
                              aria-hidden
                              className="size-4 text-primary"
                            />
                          )}
                          {o.label}
                        </span>
                        {reveal && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {pct}%
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                {total} {total === 1 ? "vote" : "votes"}
                {closed
                  ? " · closed"
                  : voted
                    ? " · tap again to take it back"
                    : ""}
              </p>
            </Card>
          );
        })}
        {polls.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground">
            No polls yet. Ask what people want: the topic, the food, the
            activity.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function NewPoll({
  onCreate,
  onCancel,
  pending,
}: {
  onCreate: (
    kind: PollKind,
    question: string,
    options: string[],
  ) => Promise<void>;
  onCancel: () => void;
  pending: boolean;
}) {
  const [kind, setKind] = React.useState<PollKind>("topic");
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState(["", ""]);
  const filled = options.filter((o) => o.trim()).length;
  const placeholders: Record<PollKind, string> = {
    topic: "What should we cover next week?",
    food: "What should we eat?",
    activity: "What should we do after?",
    other: "Your question",
  };

  return (
    <Card className="mb-3 flex flex-col gap-3 p-4">
      <Segmented<PollKind>
        options={(Object.keys(POLL_KINDS) as PollKind[]).map((k) => ({
          value: k,
          label: POLL_KINDS[k],
        }))}
        value={kind}
        onChange={setKind}
      />
      <Field label="Question" htmlFor="poll-question">
        <Input
          id="poll-question"
          value={question}
          maxLength={200}
          placeholder={placeholders[kind]}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-2">
        {options.map((o, i) => (
          <Input
            key={i}
            aria-label={`Option ${i + 1}`}
            placeholder={`Option ${i + 1}`}
            value={o}
            maxLength={120}
            onChange={(e) =>
              setOptions((all) =>
                all.map((x, j) => (j === i ? e.target.value : x)),
              )
            }
          />
        ))}
        {options.length < 8 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setOptions((all) => [...all, ""])}
          >
            <PlusIcon aria-hidden className="size-4" /> Add option
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Voting closes when the session starts.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={pending || !question.trim() || filled < 2}
          onClick={() => void onCreate(kind, question, options)}
        >
          {pending ? "Posting…" : "Post poll"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Anonymous questions
// ---------------------------------------------------------------------------

function Questions({
  eventId,
  initial,
  canLead,
  canAsk,
}: {
  eventId: string;
  initial: QuestionRow[];
  canLead: boolean;
  canAsk: boolean;
}) {
  const [questions, setQuestions] = React.useState(initial);
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<QuestionRow | null>(null);

  if (!canAsk && questions.length === 0) return null;

  const run = async (
    key: string,
    fn: () => Promise<{ data: QuestionRow[]; error: string | null }>,
    after?: () => void,
  ) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        setQuestions(res.data);
        after?.();
      }
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <SectionHeading
        action={questions.length > 0 ? `${questions.length}` : undefined}
      >
        Questions
      </SectionHeading>

      {canAsk && (
        <form
          className="mb-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              "ask",
              () => askQuestion(eventId, body),
              () => setBody(""),
            );
          }}
        >
          <Textarea
            aria-label="Your question"
            placeholder="Ask something to bring up in the session"
            value={body}
            maxLength={500}
            rows={2}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <QuestionIcon aria-hidden className="size-4 shrink-0" />
              Anonymous. Nobody, the host included, can see who asked.
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={!body.trim() || busy === "ask"}
            >
              {busy === "ask" ? "Asking…" : "Ask"}
            </Button>
          </div>
        </form>
      )}

      {questions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {questions.map((qn) => (
            <li
              key={qn.id}
              className={cn(
                "flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm",
                (qn.answered || qn.hidden) && "bg-muted",
              )}
            >
              <button
                type="button"
                aria-pressed={qn.iUpvoted}
                aria-label={
                  qn.iUpvoted ? "Take back your upvote" : "Upvote this question"
                }
                disabled={busy === qn.id || qn.hidden}
                onClick={() =>
                  void run(qn.id, () =>
                    upvoteQuestion(eventId, qn.id, !qn.iUpvoted),
                  )
                }
                className={cn(
                  "flex min-h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border text-xs font-semibold tabular-nums",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  qn.iUpvoted
                    ? "border-primary bg-primary-100 text-primary-800"
                    : "border-border text-muted-foreground hover:bg-surface-hover",
                )}
              >
                <ArrowUpIcon aria-hidden className="size-4" />
                {qn.upvotes}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-line text-foreground">
                  {qn.body}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {qn.answered && (
                    <Badge variant="success" size="sm">
                      <CheckIcon aria-hidden /> Answered
                    </Badge>
                  )}
                  {qn.hidden && (
                    <Badge variant="warning" size="sm">
                      Hidden from members
                    </Badge>
                  )}
                  {qn.mine && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        Yours
                      </span>
                      <Button
                        variant="link"
                        size="inline"
                        className="text-xs"
                        onClick={() => setRemoving(qn)}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                  {canLead && (
                    <>
                      <Button
                        variant="link"
                        size="inline"
                        className="text-xs"
                        disabled={busy === qn.id}
                        onClick={() =>
                          void run(qn.id, () =>
                            setQuestionState(
                              eventId,
                              qn.id,
                              !qn.answered,
                              qn.hidden,
                            ),
                          )
                        }
                      >
                        {qn.answered ? "Not answered" : "Mark answered"}
                      </Button>
                      <Button
                        variant="link"
                        size="inline"
                        className="text-xs"
                        disabled={busy === qn.id}
                        onClick={() =>
                          void run(qn.id, () =>
                            setQuestionState(
                              eventId,
                              qn.id,
                              qn.answered,
                              !qn.hidden,
                            ),
                          )
                        }
                      >
                        {qn.hidden ? "Show" : "Hide"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete your question?"
        description="It will be gone for everyone, with its upvotes."
        confirmLabel="Delete"
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target)
            void run(target.id, () => deleteMyQuestion(eventId, target.id));
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// The steward's tools: who is coming, cancel, edit
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<RsvpStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  no: "Can't",
};

function StewardTools({
  event,
  attendees,
}: {
  event: EventDetail;
  attendees: Attendee[];
}) {
  const [confirm, setConfirm] = React.useState(false);
  const act = useAction();
  const cancelled = event.status === "cancelled";

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-outline p-4">
      <SectionHeading
        className="mb-0"
        action={
          event.kind === "camp" ? (
            <Link
              href={`/admin/events/${event.id}`}
              className="inline-flex items-center gap-1 font-medium text-primary"
            >
              <PencilIcon aria-hidden className="size-3.5" /> Edit
            </Link>
          ) : event.seriesId ? (
            <Link
              href={`/admin/events/series/${event.seriesId}`}
              className="inline-flex items-center gap-1 font-medium text-primary"
            >
              <PencilIcon aria-hidden className="size-3.5" /> Edit series
            </Link>
          ) : undefined
        }
      >
        For organisers
      </SectionHeading>
      <p className="text-xs text-muted-foreground">
        Only stewards of {event.branchName} see these names.
      </p>

      {attendees.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {attendees.map((a) => (
            <li
              key={a.userId}
              className="flex items-start justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {a.name}
                </p>
                {a.note && (
                  <p className="text-xs text-muted-foreground">{a.note}</p>
                )}
              </div>
              <Badge
                size="sm"
                variant={
                  a.status === "going"
                    ? "success"
                    : a.status === "maybe"
                      ? "warning"
                      : "neutral"
                }
              >
                {STATUS_LABEL[a.status]}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nobody has answered yet.
        </p>
      )}

      {event.status !== "draft" && (
        <Button
          variant={cancelled ? "tonal" : "destructive-outline"}
          size="sm"
          className="self-start"
          disabled={act.pending}
          onClick={() =>
            cancelled
              ? void act.run(() => setCancelled(event.id, false))
              : setConfirm(true)
          }
        >
          {cancelled
            ? "Restore this event"
            : event.kind === "halaqah"
              ? "Cancel this week"
              : "Cancel the camp"}
        </Button>
      )}
      {act.error && (
        <p role="alert" className="text-xs text-danger">
          {act.error}
        </p>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={
          event.kind === "halaqah" ? "Cancel this week?" : "Cancel the camp?"
        }
        description="Everyone it reaches will see it marked cancelled. Their answers are kept, and you can restore it."
        confirmLabel="Cancel it"
        onConfirm={() => {
          setConfirm(false);
          void act.run(() => setCancelled(event.id, true));
        }}
      />
    </section>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import {
  CalendarIcon,
  ChevronRightIcon,
  PinIcon,
  PollIcon,
} from "@/components/app/icons";
import { RsvpButtons } from "@/components/app/event-rsvp";
import {
  applyRsvp,
  formatWhen,
  hasRoom,
  needsZoneLabel,
  relativeDay,
  repliesOpen,
  zoneCity,
  type UpcomingEvent,
} from "@/lib/events";

/**
 * One event in a list (D80): what, when, where, how many are coming, and the
 * answer in one tap. The title opens the event's own screen for the rest
 * (details, polls, questions).
 */
export function EventCard({
  event: initial,
  viewerZone,
  nowISO,
}: {
  event: UpcomingEvent;
  viewerZone: string;
  /** The server's clock at render, so server and client agree on "Today". */
  nowISO: string;
}) {
  const now = new Date(nowISO);
  const [event, setEvent] = React.useState(initial);
  const cancelled = event.status === "cancelled";
  const open = repliesOpen(event, now);
  const unvoted = event.openPolls - event.myOpenVotes;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={event.kind === "camp" ? "accent" : "primary"} size="sm">
          {event.kind === "camp" ? "Camp" : "Halaqah"}
        </Badge>
        <span className="text-xs font-medium text-muted-foreground">
          {relativeDay(event.startsAt, event.timezone, now)} ·{" "}
          {event.branchName}
        </span>
        {cancelled && (
          <Badge variant="danger" size="sm">
            Cancelled
          </Badge>
        )}
      </div>

      <Link
        href={`/events/${event.id}`}
        className="group -my-1 flex items-start justify-between gap-2 rounded-lg py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0">
          <span
            className={
              cancelled
                ? "block font-display text-lg font-semibold text-muted-foreground line-through"
                : "block font-display text-lg font-semibold text-foreground group-hover:text-primary"
            }
          >
            {event.title}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarIcon aria-hidden className="size-4 shrink-0" />
            <span>
              {formatWhen(event.startsAt, event.endsAt, event.timezone)}
              {needsZoneLabel(event.startsAt, event.timezone, viewerZone) &&
                ` (${zoneCity(event.timezone)} time)`}
            </span>
          </span>
          {event.venue && (
            <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <PinIcon aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{event.venue}</span>
            </span>
          )}
        </span>
        <ChevronRightIcon
          aria-hidden
          className="mt-1 size-5 shrink-0 text-muted-foreground"
        />
      </Link>

      {!cancelled && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {event.going}
          </span>{" "}
          going
          {event.maybe > 0 && (
            <>
              {" "}
              · <span className="tabular-nums">{event.maybe}</span> maybe
            </>
          )}
          {event.capacity != null && (
            <>
              {" "}
              ·{" "}
              <span className="tabular-nums">
                {Math.max(0, event.capacity - event.going)}
              </span>{" "}
              places left
            </>
          )}
        </p>
      )}

      {!cancelled && unvoted > 0 && (
        <Link
          href={`/events/${event.id}#polls`}
          className="flex items-center gap-2 rounded-lg bg-accent-100 px-3 py-2 text-sm font-medium text-accent-800"
        >
          <PollIcon aria-hidden className="size-4 shrink-0" />
          {unvoted === 1
            ? "A poll is waiting for your vote"
            : `${unvoted} polls are waiting for your vote`}
        </Link>
      )}

      {open && (
        <RsvpButtons
          eventId={event.id}
          value={event.myStatus}
          full={!hasRoom(event)}
          onChange={(next, prev) => setEvent((e) => applyRsvp(e, next, prev))}
        />
      )}
    </Card>
  );
}

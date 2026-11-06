"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { buttonVariants, Card } from "@/components/ui";
import {
  CalendarIcon,
  ChevronRightIcon,
  PollIcon,
} from "@/components/app/icons";
import { RsvpButtons } from "@/components/app/event-rsvp";
import { loadUpcoming } from "@/lib/upcoming-cache";
import { easeBrand, DURATION } from "@/lib/motion";
import {
  clockAt,
  relativeDay,
  upNext,
  type UpcomingEvent,
  type UpNextReason,
} from "@/lib/events";

/**
 * Today's one line about events (D80), or nothing.
 *
 * LOGGING COMES FIRST. Today is where people tap their dhikr, so this card:
 *   * is fetched in the browser AFTER the screen has painted, so it adds
 *     nothing to the time before the rings can be tapped;
 *   * sits BELOW the rings, so arriving late moves nothing under the thumb;
 *   * shows only when there is one thing to do in a tap (vote, answer) or
 *     something very close (`upNext` in lib/events.ts), and is absent on most
 *     days rather than a permanent block.
 *
 * Fetched once per document (`lib/upcoming-cache.ts`): switching circles does
 * not re-ask, because the answer is the member's, not the circle's.
 */
export function UpNextCard() {
  const [pick, setPick] = React.useState<{
    event: UpcomingEvent;
    reason: UpNextReason;
  } | null>(null);
  const [answered, setAnswered] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    loadUpcoming()
      .then((events) => {
        if (live) setPick(upNext(events, new Date()));
      })
      // A failure here must never surface on Today. The events screen has its
      // own error handling; this card simply does not appear.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <AnimatePresence initial={false}>
      {pick && (
        <motion.section
          key={pick.event.id}
          aria-label="Up next"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={easeBrand(DURATION.base)}
        >
          <Card className="flex flex-col gap-3 p-4">
            <Link
              href={`/events/${pick.event.id}${pick.reason === "vote" ? "#polls" : ""}`}
              className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-800">
                {pick.reason === "vote" ? (
                  <PollIcon aria-hidden className="size-5" />
                ) : (
                  <CalendarIcon aria-hidden className="size-5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  {headline(pick.event, pick.reason)}
                </span>
                <span className="block truncate font-medium text-foreground">
                  {pick.event.title}
                </span>
              </span>
              {pick.reason === "vote" ? (
                // A label styled as the button, not a <button>: the whole row is
                // already the link, and a button inside a link is invalid.
                <span
                  className={buttonVariants({ size: "sm", variant: "accent" })}
                >
                  Vote
                </span>
              ) : (
                <ChevronRightIcon
                  aria-hidden
                  className="size-5 shrink-0 text-muted-foreground"
                />
              )}
            </Link>
            {pick.reason === "reply" && !answered && (
              <RsvpButtons
                eventId={pick.event.id}
                value={pick.event.myStatus}
                onChange={(next) => {
                  if (next) setAnswered(true);
                }}
              />
            )}
            {pick.reason === "reply" && answered && (
              <p className="text-sm text-muted-foreground">
                Thanks. Change your answer any time from the event.
              </p>
            )}
          </Card>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function headline(e: UpcomingEvent, reason: UpNextReason): string {
  const day = relativeDay(e.startsAt, e.timezone, new Date());
  // A camp is a day or a weekend; a halaqah is a time.
  const when =
    e.kind === "camp" ? day : `${day} ${clockAt(e.startsAt, e.timezone)}`;
  if (reason === "vote") return `${when} · Have your say`;
  if (reason === "reply") return `${when} · Are you coming?`;
  return `${when} · You're going`;
}

/**
 * A quiet way into /events from the circle's screen: how many things are
 * coming up and the next one. Absent when nothing is. Shares the card's one
 * fetch.
 */
export function EventsLink() {
  const [events, setEvents] = React.useState<UpcomingEvent[] | null>(null);
  React.useEffect(() => {
    let live = true;
    loadUpcoming()
      .then((all) => {
        if (live) setEvents(all.filter((e) => e.status === "published"));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!events || events.length === 0) return null;
  const next = events[0];
  return (
    <Link
      href="/events"
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-800">
        <CalendarIcon aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {events.length === 1
            ? "1 event coming up"
            : `${events.length} events coming up`}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          Next: {next.title},{" "}
          {relativeDay(next.startsAt, next.timezone, new Date())}
        </span>
      </span>
      <ChevronRightIcon
        aria-hidden
        className="size-5 shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

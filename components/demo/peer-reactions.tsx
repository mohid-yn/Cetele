"use client";

/**
 * One-tap peer reactions (CET-18) — the social spark Cetele had no version of.
 *
 * When a peer closes their rings, anyone can send a one-tap dua / "mashaAllah" /
 * ❤️ — near-zero effort, manufacturing relatedness (the digital nod across the
 * room; Strava's kudos run on exactly this). Reactions live in the mock store so
 * a tap really lands on the peer's day.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { REACTIONS, isoDate } from "@/lib/mock/data";
import type { ReactionKind } from "@/lib/mock/types";
import { MemberRow } from "./member-row";
import { SectionHeading } from "./section-heading";
import { CheckIcon } from "./icons";

/** The tappable glyph row for one peer. */
export function PeerReactions({ toUserId }: { toUserId: string }) {
  const { state, actions } = useMock();
  const counts = sel.reactionsTo(state, toUserId);

  return (
    <div className="flex flex-wrap gap-1.5">
      {REACTIONS.map((r) => {
        const info = counts.get(r.kind);
        const reacted = info?.reacted ?? false;
        const count = info?.count ?? 0;
        return (
          <button
            key={r.kind}
            type="button"
            aria-pressed={reacted}
            aria-label={r.label}
            onClick={() =>
              actions.sendReaction(toUserId, r.kind as ReactionKind)
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors",
              reacted
                ? "border-primary-300 bg-primary-100 text-primary-800"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            <span aria-hidden>{r.glyph}</span>
            {count > 0 && (
              <span className="text-xs font-semibold tabular-nums">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The /today "Your circle today" section — one unified view of the circle
 * (replacing the old separate avatar strip + cheer list). Members who've
 * finished are shown first with a one-tap reaction row; everyone else shows
 * their progress. Calm — no shaming empty-state.
 */
export function CircleToday() {
  const { state } = useMock();
  const me = state.session.currentUserId;
  const group = sel.activeGroup(state);
  const myCheers = sel.reactionCount(state, me);

  const members = sel
    .groupMembers(state, group.id)
    .filter((m) => m.userId !== me)
    .map((m) => ({
      ...m,
      done: sel.doneToday(state, m.userId, group.id),
      pct: sel.dayCompletion(state, m.userId, group.id, isoDate(0)).pct,
    }))
    // Finished members first, then by progress — leads with the celebratable.
    .sort((a, b) => Number(b.done) - Number(a.done) || b.pct - a.pct);

  if (!members.length) return null;

  return (
    <section>
      <SectionHeading
        action={myCheers > 0 ? `you received ${myCheers} today 🤲` : undefined}
      >
        Your circle today
      </SectionHeading>
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li
            key={m.userId}
            className="rounded-2xl border border-border bg-card p-3 shadow-sm"
          >
            <MemberRow
              name={m.user.name}
              role={m.role}
              status={
                m.done ? (
                  <span className="font-medium text-success">
                    all rings closed
                  </span>
                ) : (
                  <span className="tabular-nums">
                    {Math.round(m.pct * 100)}% today
                  </span>
                )
              }
              trailing={
                m.done ? (
                  <CheckIcon className="size-5 text-success" />
                ) : undefined
              }
            />
            {m.done && (
              <div className="mt-2.5 pl-11">
                <PeerReactions toUserId={m.userId} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

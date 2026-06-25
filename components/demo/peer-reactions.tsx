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
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { REACTIONS } from "@/lib/mock/data";
import type { ReactionKind } from "@/lib/mock/types";

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
 * The /today "cheer your circle" section: peers who have closed all their rings
 * today, each with a reaction row. Calm empty-state when nobody's finished yet.
 */
export function CheerCircle() {
  const { state } = useMock();
  const me = state.session.currentUserId;
  const group = sel.activeGroup(state);
  const members = sel.groupMembers(state, group.id);

  const done = members.filter(
    (m) => m.userId !== me && sel.doneToday(state, m.userId, group.id),
  );
  const myCheers = sel.reactionCount(state, me);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Cheer your circle
        </h2>
        {myCheers > 0 && (
          <span className="text-xs text-muted-foreground">
            you received {myCheers} today 🤲
          </span>
        )}
      </div>

      {done.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Nobody&apos;s closed all their rings yet today — be the first, and
          your circle can cheer you on.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {done.map((m) => (
            <li
              key={m.userId}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <Avatar name={m.user.name} size="sm" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {m.user.name.split(" ")[0]}
                  </p>
                  <p className="text-xs font-medium text-success">
                    all rings closed
                  </p>
                </div>
              </div>
              <PeerReactions toUserId={m.userId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

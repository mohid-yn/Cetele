"use client";

/**
 * One-tap peer reactions (CET-18) — the social spark Cetele had no version of.
 *
 * When a peer closes every ring, anyone in the circle can send a one-tap dua /
 * "mashaAllah" / ❤️ — near-zero effort, manufacturing relatedness (the digital
 * nod across the room; Strava's kudos run on exactly this).
 *
 * Optimistic: a tap flips the pill immediately, then reconciles against the
 * RPC's authoritative answer (`toggle_reaction` returns whether MY reaction now
 * stands; tapping again undoes it).
 *
 * State is split into (peers, mine) rather than a single total, so the optimistic
 * update is one boolean flip and the displayed count simply falls out of it —
 * no add/subtract bookkeeping that could drift from the server's tally.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { REACTIONS, type ReactionKind } from "@/lib/retention";
import { toggleReaction } from "@/app/(app)/g/[groupId]/today/actions";

/** Reaction tallies for one peer: kind → total sent, and whether I sent one. */
export type ReactionTally = Record<
  ReactionKind,
  { count: number; mine: boolean }
>;

/** Peers' contribution alone — the part my own tap can never change. */
const peersOnly = (t: ReactionTally, kind: ReactionKind) =>
  t[kind].count - (t[kind].mine ? 1 : 0);

export function PeerReactions({
  groupId,
  toUserId,
  toName,
  tally,
}: {
  groupId: string;
  toUserId: string;
  toName: string;
  tally: ReactionTally;
}) {
  // The server's view of my reactions — plain derived data, never state.
  const serverMine = React.useMemo(
    () =>
      Object.fromEntries(
        REACTIONS.map((r) => [r.kind, tally[r.kind].mine]),
      ) as Record<ReactionKind, boolean>,
    [tally],
  );

  // Only MY half is optimistic; peers' counts always come from the server.
  // useOptimistic (not useState + an effect) because it drops the optimistic
  // value automatically once the action settles and the revalidated props
  // arrive — which means a FAILED toggle rolls back for free, with no
  // bookkeeping of what to restore.
  const [mine, flip] = React.useOptimistic(
    serverMine,
    (state, kind: ReactionKind) => ({ ...state, [kind]: !state[kind] }),
  );
  const [pending, startTransition] = React.useTransition();

  const send = (kind: ReactionKind) => {
    startTransition(async () => {
      flip(kind);
      await toggleReaction(groupId, toUserId, kind);
      // No reconcile step: the action revalidates /today, so the next render's
      // `tally` IS the authoritative answer (and on error it is the unchanged
      // one, so the pill snaps back).
    });
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {REACTIONS.map((r) => {
        const isMine = mine[r.kind];
        const count = peersOnly(tally, r.kind) + (isMine ? 1 : 0);
        return (
          <button
            key={r.kind}
            type="button"
            aria-pressed={isMine}
            aria-label={`${r.label} for ${toName}`}
            disabled={pending}
            onClick={() => send(r.kind)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors disabled:opacity-70",
              isMine
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

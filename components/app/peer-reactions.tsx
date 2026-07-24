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
 *
 * D45, learned twice: this used to lean ENTIRELY on `revalidatePath` — it threw
 * the action's return value away and let `useOptimistic` fall back to whatever
 * the next render's props said. When the revalidation coalesced with the
 * in-flight refresh and was dropped, the fallback was the STALE prop, so
 * untoggling left the pill stuck pressed with nothing to correct it — a 5s wait
 * never recovered because no further render was coming. It only showed up under
 * parallel load, which is why it read as a flake for so long.
 *
 * So the action's `reacted` is now the reconciliation, and it always arrives.
 * Props still win when they genuinely change — but keyed on the VALUES, not
 * object identity, so a re-render carrying the same (or stale) tally can't
 * clobber the answer we just got back.
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
  // The server's view of my reactions.
  const serverMine = React.useMemo(
    () =>
      Object.fromEntries(
        REACTIONS.map((r) => [r.kind, tally[r.kind].mine]),
      ) as Record<ReactionKind, boolean>,
    [tally],
  );
  // Keyed on the VALUES, so a re-render carrying an identical (or stale) tally
  // is not mistaken for the server changing its mind.
  const serverKey = REACTIONS.map((r) => Number(tally[r.kind].mine)).join("");

  // Settled truth, seeded from the server and then owned by the action's reply.
  // Re-seeds only when the server's actual answer changes — React's endorsed
  // adjust-state-during-render pattern, same as lib/use-prop-state.ts, but on a
  // value key rather than identity.
  const [settled, setSettled] = React.useState(serverMine);
  const [seenKey, setSeenKey] = React.useState(serverKey);
  if (serverKey !== seenKey) {
    setSeenKey(serverKey);
    setSettled(serverMine);
  }

  // Only MY half is optimistic; peers' counts always come from the server.
  const [mine, flip] = React.useOptimistic(
    settled,
    (state, kind: ReactionKind) => ({ ...state, [kind]: !state[kind] }),
  );
  const [pending, startTransition] = React.useTransition();

  const send = (kind: ReactionKind) => {
    startTransition(async () => {
      flip(kind);
      const res = await toggleReaction(groupId, toUserId, kind);
      // `reacted` is whether MY reaction now stands — the same fact the pill
      // renders. On error we leave `settled` alone, so dropping the optimistic
      // value snaps the pill back to where it was.
      if (!res.error) {
        setSettled((s) => ({ ...s, [kind]: res.reacted }));
      }
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

"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Badge, Button, ConfirmDialog } from "@/components/ui";
import { AlertIcon, CheckIcon } from "@/components/app/icons";
import { useAction } from "@/lib/use-action";
import { DURATION, easeBrand } from "@/lib/motion";
import {
  reachSentence,
  type Reach,
  type Readiness,
} from "@/lib/programme-readiness";
import { setRoadmapPublished } from "./authoring-actions";

/**
 * Who can see this roadmap, right now, in one sentence (D72).
 *
 * "Published" alone was the trap: it reads as finished, but a member sees nothing
 * until their circle is on the roadmap too. So the sentence counts the people it
 * actually reaches, and the only control beside it is the next useful step.
 */
export function ReachCard({
  roadmapId,
  name,
  published,
  reach,
  readiness,
  onAddCircles,
}: {
  roadmapId: string;
  name: string;
  published: boolean;
  reach: Reach;
  readiness: Readiness;
  onAddCircles: () => void;
}) {
  const publish = useAction();
  const [confirming, setConfirming] = React.useState(false);
  const blocked = readiness.blockers.length > 0;
  const sentence = reachSentence(reach);

  const setPublished = (next: boolean, after?: () => void) =>
    void publish.run(() => setRoadmapPublished(roadmapId, next), after);

  return (
    <section
      aria-label="Who can see this roadmap"
      className="rounded-2xl bg-muted p-4"
    >
      {/* Only a draft needs the word. "Live" just repeated the sentence below. */}
      {reach.state === "draft" && (
        <Badge variant="outline" size="sm" className="mb-2">
          Draft
        </Badge>
      )}

      {/* The sentence changes when a circle is toggled or the roadmap is
          published. A short crossfade marks that it changed, and it is announced
          because the control that caused it can be elsewhere on the page. */}
      <div aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={sentence}
            className="font-display text-lg leading-7 font-semibold text-balance text-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={easeBrand(DURATION.fast)}
          >
            {sentence}
          </motion.p>
        </AnimatePresence>
      </div>

      {!published && blocked && (
        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">
            Before you can publish
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {readiness.blockers.map((b) => (
              <li
                key={b.id}
                className="flex gap-2 text-sm text-muted-foreground"
              >
                <AlertIcon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-warning"
                />
                <span>{b.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!published && !blocked && (
        <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
          <CheckIcon
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-success"
          />
          <span>
            Ready to publish.
            {readiness.notes.length > 0 &&
              ` ${readiness.notes.map((n) => n.message).join(" ")}`}
          </span>
        </p>
      )}

      {published && blocked && (
        <ul className="mt-3 flex flex-col gap-1">
          {readiness.blockers.map((b) => (
            <li key={b.id} className="flex gap-2 text-sm text-muted-foreground">
              <AlertIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
              <span>{b.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!published && (
          <Button
            variant="accent"
            disabled={blocked || publish.pending}
            onClick={() => setPublished(true)}
          >
            {publish.pending ? "Publishing…" : "Publish"}
          </Button>
        )}
        {reach.state === "unassigned" && (
          <Button variant="primary" onClick={onAddCircles}>
            Add circles
          </Button>
        )}
        {published && (
          <Button
            variant="outline"
            disabled={publish.pending}
            onClick={() =>
              reach.state === "live" ? setConfirming(true) : setPublished(false)
            }
          >
            {publish.pending ? "Saving…" : "Withdraw"}
          </Button>
        )}
      </div>

      {publish.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {publish.error}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Withdraw “${name}”?`}
        description={`It disappears for ${reach.members} ${reach.members === 1 ? "member" : "members"} straight away. Nothing they recorded is lost, and publishing again puts everything back.`}
        confirmLabel="Withdraw"
        onConfirm={() => setPublished(false, () => setConfirming(false))}
      />
    </section>
  );
}

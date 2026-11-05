"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/components/ui";
import { CheckIcon, ChevronRightIcon } from "@/components/app/icons";
import { useAction } from "@/lib/use-action";
import { setTakingPart } from "./actions";

/**
 * An organiser joins a roadmap as themselves, with no circle (D76), and lands on
 * the screen where they log. Offered only when they have no other way to log.
 */
export function TakePart({
  roadmapId,
  name,
  asRow = false,
}: {
  roadmapId: string;
  /** Names the roadmap for a screen reader where several are listed. */
  name?: string;
  /** A row in a card on the hub, rather than a button in the editor's header. */
  asRow?: boolean;
}) {
  const router = useRouter();
  const join = useAction();

  const onClick = () =>
    void join.run(
      () => setTakingPart(roadmapId, true),
      () => router.push(`/roadmap?r=${roadmapId}`),
    );

  const error = join.error && (
    <p role="alert" className="px-4 py-2 text-xs text-danger">
      {join.error}
    </p>
  );

  if (asRow) {
    return (
      <>
        <button
          type="button"
          onClick={onClick}
          disabled={join.pending}
          aria-label={`Take part in ${name}`}
          className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-hover active:bg-surface-active disabled:text-disabled-foreground"
        >
          <CheckIcon aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">
            {join.pending ? "Joining…" : "Take part"}
          </span>
          <ChevronRightIcon
            aria-hidden
            className="size-5 shrink-0 text-muted-foreground"
          />
        </button>
        {error}
      </>
    );
  }

  return (
    <>
      <Button
        variant="tonal"
        size="sm"
        disabled={join.pending}
        onClick={onClick}
      >
        <CheckIcon aria-hidden />
        {join.pending ? "Joining…" : "Take part"}
      </Button>
      {error}
    </>
  );
}

/** Leaving keeps what they recorded, and the dialog says so. */
export function StopTakingPart({
  roadmapId,
  name,
}: {
  roadmapId: string;
  name: string;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const leave = useAction();

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={leave.pending}
        onClick={() => setConfirming(true)}
      >
        Stop taking part
      </Button>
      {leave.error && (
        <p role="alert" className="w-full text-xs text-danger">
          {leave.error}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Stop taking part?"
        description={`You will stop being on ${name}. What you have recorded is kept, and comes back if you join again.`}
        confirmLabel="Stop taking part"
        onConfirm={() => {
          setConfirming(false);
          void leave.run(() => setTakingPart(roadmapId, false));
        }}
      />
    </>
  );
}

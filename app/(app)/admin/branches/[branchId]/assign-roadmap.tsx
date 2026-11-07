"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog } from "@/components/ui";
import { FlagIcon } from "@/components/app/icons";
import { usePropState } from "@/lib/use-prop-state";
import { setBranchOnRoadmap } from "@/app/(app)/programme/[roadmapId]/authoring-actions";

/**
 * Assign roadmaps to THIS branch (D81, D82), from the branch's own page. The
 * same switch as the roadmap editor's "Who follows" tab, seen from the other
 * side, so an organiser can work from whichever end they are standing at.
 */
export function AssignRoadmap({
  branchId,
  branchName,
  circles,
  roadmaps: initial,
}: {
  branchId: string;
  branchName: string;
  /** Circles in this branch and every branch inside it. */
  circles: number;
  roadmaps: { id: string; name: string; published: boolean; here: boolean }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [roadmaps, setRoadmaps] = usePropState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = async (id: string, next: boolean) => {
    setBusy(id);
    setError(null);
    setRoadmaps((list) =>
      list.map((r) => (r.id === id ? { ...r, here: next } : r)),
    );
    const res = await setBranchOnRoadmap(id, branchId, next);
    setBusy(null);
    if (res.error) {
      setRoadmaps((list) =>
        list.map((r) => (r.id === id ? { ...r, here: !next } : r)),
      );
      setError(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <>
      <Button variant="tonal" size="sm" onClick={() => setOpen(true)}>
        <FlagIcon aria-hidden className="size-4" /> Assign a roadmap
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Roadmaps for ${branchName}`}
        description={`A ticked roadmap reaches all ${circles} ${circles === 1 ? "circle" : "circles"} in ${branchName} and the branches inside it, including circles that join later.`}
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        {roadmaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No roadmaps yet. Build one in Roadmaps first.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {roadmaps.map((r) => (
              <li key={r.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary"
                    checked={r.here}
                    disabled={busy !== null}
                    onChange={() => void toggle(r.id, !r.here)}
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                    {r.name}
                  </span>
                  {!r.published && (
                    <Badge variant="outline" size="sm">
                      Draft
                    </Badge>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}

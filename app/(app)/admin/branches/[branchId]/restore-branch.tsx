"use client";

import { Button } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { setBranchArchived } from "../actions";

/** Bring an archived branch back (D87): it reaches its circles again. */
export function RestoreBranchButton({ branchId }: { branchId: string }) {
  const act = useAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="tonal"
        disabled={act.pending}
        onClick={() => void act.run(() => setBranchArchived(branchId, false))}
      >
        {act.pending ? "Restoring…" : "Restore"}
      </Button>
      {act.error && (
        <p role="alert" className="text-xs text-danger">
          {act.error}
        </p>
      )}
    </div>
  );
}

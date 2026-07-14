"use client";

/**
 * Member task-breakdown (admin oversight, real — M5). When an owner/co-admin
 * taps a member on the Group → Members roster, this shows that member's
 * per-task completion for the last fortnight so they can follow up about
 * *specific days* ("you missed Salawat Tue–Thu — everything ok?").
 * Forgiveness-framed (D8): a missed day is a calm neutral cell, never red.
 *
 * Data is fetched server-side (one `logs` range scan under RLS) and handed in;
 * for an admin the grid is editable (D29 proxy-log via the `setCount` action).
 */

import { Dialog, Badge } from "@/components/ui";
import { TaskGrid, type GridRow } from "./task-grid";
import { FlameIcon } from "@/components/app/icons";

export type BreakdownMember = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  score: number;
  daysFull: number;
  streak: number;
  rows: GridRow[];
};

export function MemberBreakdownDialog({
  member,
  days,
  viewerId,
  names,
  editable,
  open,
  onClose,
}: {
  member: BreakdownMember | null;
  days: number;
  viewerId: string;
  names: Record<string, string>;
  editable: boolean;
  open: boolean;
  onClose: () => void;
}) {
  if (!member) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={member.name}
      description={
        editable
          ? `Last ${days} days · tap a square to view or log that day`
          : `Last ${days} days · tap a square for that day's detail`
      }
      // Full-width on phones, but grow on larger screens so the grid is
      // comfortable instead of a tiny box in the middle of a wide desktop.
      className="max-w-[min(95vw,48rem)]"
    >
      <div className="flex flex-col gap-4">
        {/* Summary chips */}
        <div className="flex flex-wrap items-center gap-2">
          {member.role === "owner" && (
            <Badge variant="accent" size="sm">
              owner
            </Badge>
          )}
          {member.role === "admin" && (
            <Badge variant="primary" size="sm">
              co-admin
            </Badge>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
            {member.score}% fully complete
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
            {member.daysFull}/{days} full days
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
            <FlameIcon className="size-3.5 text-accent" />
            {member.streak}d streak
          </span>
        </div>

        {/* The readable task × day grid (shared with the personal Progress view);
            editable for admins so they can tally for a member (D29). */}
        <TaskGrid
          userId={member.id}
          viewerId={viewerId}
          rows={member.rows}
          names={names}
          days={days}
          editable={editable}
        />
      </div>
    </Dialog>
  );
}

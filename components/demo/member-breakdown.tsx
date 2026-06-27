"use client";

/**
 * Member task-breakdown (admin oversight). When a group/app admin taps a member
 * on the Group → Members roster, this shows that member's per-task completion
 * for the last fortnight — so the admin can follow up about *specific days*
 * ("you missed Salawat Tue–Thu — everything ok?"). Forgiveness-framed (D8): a
 * missed day is a calm neutral cell, never a red alarm. Read-only.
 *
 * Fortnight window by design: short enough to be cheap to store/query, long
 * enough to spot a slip. Behind a real backend it's one `logs` range scan.
 */

import * as React from "react";
import { Dialog, Badge } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { isoDate } from "@/lib/mock/data";
import { TaskBreakdownGrid } from "./task-breakdown-grid";
import { FlameIcon } from "./icons";

const DAYS = 14;

export function MemberBreakdownDialog({
  userId,
  groupId,
  open,
  onClose,
}: {
  userId: string | null;
  groupId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { state } = useMock();

  if (!userId) return null;

  const user = sel.user(state, userId);
  if (!user) return null;

  // D29: an admin/owner viewing this can log/adjust on the member's behalf
  // (the halaqah tally); attribution + self-correct are handled in the grid.
  const canManage = sel.canManageGroup(
    state,
    state.session.currentUserId,
    groupId,
  );
  const role = sel.membershipRole(state, userId, groupId);
  const dates = Array.from({ length: DAYS }, (_, i) => isoDate(DAYS - 1 - i));
  const score = sel.consistency(state, userId, groupId, DAYS);
  const streak = sel.streak(state, userId)?.current ?? 0;
  const daysFull = Array.from({ length: DAYS }, (_, i) =>
    sel.dayCompletion(state, userId, groupId, dates[i]),
  ).filter((d) => d.full).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={user.name}
      description={
        canManage
          ? `Last ${DAYS} days · tap a square to view or log that day`
          : `Last ${DAYS} days · tap a square for that day's detail`
      }
      // Full-width on phones, but grow on larger screens so the 14-day grid is
      // comfortable instead of a tiny box in the middle of a wide desktop.
      className="max-w-[min(95vw,48rem)]"
    >
      <div className="flex flex-col gap-4">
        {/* Summary chips */}
        <div className="flex flex-wrap items-center gap-2">
          {role === "owner" && (
            <Badge variant="accent" size="sm">
              owner
            </Badge>
          )}
          {role === "admin" && (
            <Badge variant="primary" size="sm">
              co-admin
            </Badge>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
            {score}% fully complete
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
            {daysFull}/{DAYS} full days
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
            <FlameIcon className="size-3.5 text-accent" />
            {streak}d streak
          </span>
        </div>

        {/* The readable task × day grid (shared with the personal Progress view);
            editable for admins so they can tally for a member (D29). */}
        <TaskBreakdownGrid
          userId={userId}
          groupId={groupId}
          days={DAYS}
          editable={canManage}
        />
      </div>
    </Dialog>
  );
}

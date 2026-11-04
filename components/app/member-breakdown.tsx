"use client";

/**
 * Member task-breakdown (admin oversight, real — M5). When an owner/co-admin
 * taps a member on the Group → Members roster, this shows that member's
 * per-task record for the last fortnight so they can follow up about *specific
 * days* ("you missed Salawat Tue–Thu — everything ok?"), log on their behalf
 * (D29), and set what the circle asks of them (D61).
 * Forgiveness-framed (D8): a missed day is a calm neutral cell, never red.
 *
 * TWO JOBS, TWO TABS
 *
 * Logging a day and deciding a share are different acts on different clocks: one
 * is "write down what happened", done often and quickly; the other is "change
 * what we ask of this person", done rarely and deliberately. Stacking them in
 * one scroll would put a control that rewrites the member's obligation directly
 * under the numeric inputs an admin taps through every week — and the roadmap
 * hub (D59) is this repo's own record of what happens when one screen carries
 * two jobs: the one you reach for gets buried under the one you don't.
 *
 * Data is fetched server-side (one `logs` range scan under RLS) and handed in.
 */

import * as React from "react";
import { Dialog, Badge } from "@/components/ui";
import { TaskGrid, type GridRow } from "./task-grid";
import { MemberShares, type MemberShare } from "./member-shares";
import { Segmented } from "./segmented";
import { FlameIcon } from "@/components/app/icons";

export type BreakdownMember = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  score: number;
  daysFull: number;
  streak: number;
  rows: GridRow[];
  /** What the circle asks of them per task, for the Share tab (D61). */
  shares: MemberShare[];
};

type Tab = "record" | "share";

export function MemberBreakdownDialog({
  member,
  groupId,
  days,
  viewerId,
  names,
  editable,
  open,
  onClose,
}: {
  member: BreakdownMember | null;
  groupId: string;
  days: number;
  viewerId: string;
  names: Record<string, string>;
  editable: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<Tab>("record");

  if (!member) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={member.name}
      description={
        editable
          ? `Last ${days} days · tap a square to open that day`
          : `Last ${days} days · tap a square for that day's detail`
      }
      // Full-width on phones, but grow on larger screens so the grid is
      // comfortable instead of a tiny box in the middle of a wide desktop.
      className="max-w-[min(95vw,48rem)]"
    >
      <div className="flex flex-col gap-4">
        {/* Facts, so they read as text. These were filled pills, which on a phone
            look like controls and did nothing when tapped. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground tabular-nums">
          {member.role === "owner" && (
            <Badge variant="primary" size="sm">
              Owner
            </Badge>
          )}
          {member.role === "admin" && (
            <Badge variant="outline" size="sm">
              Co-admin
            </Badge>
          )}
          <span>{member.score}% fully complete</span>
          <span>
            {member.daysFull}/{days} full days
          </span>
          <span className="inline-flex items-center gap-1">
            <FlameIcon aria-hidden className="size-3.5 text-primary" />
            {member.streak}d streak
          </span>
        </div>

        {/* Only an admin can change a share, so a plain viewer gets the record
            alone rather than a tab strip with one inert half. */}
        {editable && (
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "record", label: "Record" },
              { value: "share", label: "Their share" },
            ]}
          />
        )}

        {tab === "record" || !editable ? (
          /* The readable task × day grid (shared with the personal Progress
             view); editable for admins so they can tally for a member (D29). */
          <TaskGrid
            userId={member.id}
            viewerId={viewerId}
            rows={member.rows}
            names={names}
            days={days}
            editable={editable}
          />
        ) : (
          <MemberShares
            groupId={groupId}
            userId={member.id}
            memberName={member.name}
            shares={member.shares}
          />
        )}
      </div>
    </Dialog>
  );
}

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { configureWebPush, sendToDevices } from "@/lib/push/send";
import { groupHref } from "@/lib/group-href";

/**
 * The reminder sender (M8 / CET-11).
 *
 * pg_cron ticks every minute inside Postgres and, only when something is
 * actually due, pg_net POSTs here (migration 0013). Vercel does NO scheduling —
 * its Hobby plan caps cron at once per day, which can't fire a member's chosen
 * clock time (D30). So the schedule lives in the DB and this route is purely
 * the sender, where the VAPID private key already lives.
 *
 * `claim_due_reminders()` is the single source of truth: it stamps last_sent_on
 * in the same statement that returns the rows, so an overlapping tick can never
 * double-send. A push service answering 404/410 means the subscription is dead
 * (app uninstalled, permission revoked) → we delete it, so the table doesn't
 * rot.
 */
export const dynamic = "force-dynamic";

type DueReminder = {
  reminder_id: string;
  user_id: string;
  group_id: string;
  task_id: string;
  task_label: string;
  target_count: number;
  current_count: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function POST(request: Request) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  // Only pg_cron holds the secret. Anything else gets nothing back — not even
  // a hint that there were reminders due. Constant-time comparison, so the
  // check can't leak how much of a guessed secret matched.
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!configureWebPush()) {
    return NextResponse.json({ error: "VAPID keys missing" }, { status: 503 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("claim_due_reminders");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data ?? []) as DueReminder[];

  // One reminder can target several devices; each row is already (reminder ×
  // device), so send them independently and collect the dead endpoints.
  const results = await Promise.all(
    due.map(async (r) => {
      const remaining = Math.max(0, r.target_count - r.current_count);
      return sendToDevices([r], {
        title: r.task_label,
        body:
          r.current_count > 0
            ? `${remaining.toLocaleString()} to go — pick up where you left off.`
            : `Time for your ${r.task_label.toLowerCase()}.`,
        url: groupHref(r.group_id, `/count/${r.task_id}`),
        tag: `reminder-${r.reminder_id}`,
      });
    }),
  );

  const sent = results.reduce((n, r) => n + r.sent, 0);
  const dead = results.flatMap((r) => r.dead);

  let pruned = 0;
  if (dead.length) {
    // Report what was actually removed, not what we intended to remove — an
    // ignored error here would let dead subscriptions pile up invisibly while
    // the response cheerfully claimed they were pruned.
    const { error: pruneError, count } = await supabase
      .from("push_subscriptions")
      .delete({ count: "exact" })
      .in("endpoint", dead);
    if (pruneError) {
      return NextResponse.json(
        { due: due.length, sent, pruned: 0, pruneError: pruneError.message },
        { status: 500 },
      );
    }
    pruned = count ?? 0;
  }

  return NextResponse.json({ due: due.length, sent, pruned });
}

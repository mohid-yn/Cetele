import { NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
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
  // a hint that there were reminders due.
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "VAPID keys missing" }, { status: 503 });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("claim_due_reminders");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data ?? []) as DueReminder[];
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    due.map(async (r) => {
      const remaining = Math.max(0, r.target_count - r.current_count);
      const payload = JSON.stringify({
        title: r.task_label,
        body:
          r.current_count > 0
            ? `${remaining.toLocaleString()} to go — pick up where you left off.`
            : `Time for your ${r.task_label.toLowerCase()}.`,
        url: groupHref(r.group_id, `/count/${r.task_id}`),
        tag: `reminder-${r.reminder_id}`,
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: r.endpoint,
            keys: { p256dh: r.p256dh, auth: r.auth },
          },
          payload,
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410 = the endpoint is gone for good (uninstalled, revoked).
        // Anything else (network blip, 5xx) is transient — leave it alone and
        // let the next reminder try again.
        if (status === 404 || status === 410) dead.push(r.endpoint);
      }
    }),
  );

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

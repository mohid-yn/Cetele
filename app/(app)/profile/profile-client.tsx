"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar, Badge, Button, Card } from "@/components/ui";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { FlameIcon, ChevronRightIcon } from "@/components/demo/icons";
import { useAction } from "@/lib/use-action";
import {
  pushSupported,
  needsIosInstall,
  subscribeToPush,
  unsubscribeFromPush,
  currentEndpoint,
} from "@/lib/push/client";
import {
  savePushSubscription,
  removePushSubscription,
  setReminder,
  sendTestPush,
} from "./actions";

export type ReminderTask = {
  taskId: string;
  label: string;
  groupName: string;
  time: string; // "HH:MM"
  enabled: boolean;
};

/** 24h "07:45" → "7:45 AM" (stored 24h, shown 12h — D30). */
function to12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export function ProfileClient({
  name,
  role,
  groupName,
  streak,
  tasks,
  vapidPublicKey,
}: {
  name: string;
  role: string | null;
  groupName: string | null;
  streak: number;
  tasks: ReminderTask[];
  vapidPublicKey: string;
}) {
  const pushAct = useAction();

  // Whether THIS device is subscribed can only be answered by the browser — the
  // server knows the member's devices, not which one you're holding.
  const [subscribed, setSubscribed] = React.useState<boolean | null>(null);
  const [iosInstall, setIosInstall] = React.useState(false);
  const [supported, setSupported] = React.useState(true);

  React.useEffect(() => {
    // Mount-time capability catch-up. None of this exists during SSR (no
    // navigator, no PushManager, no service worker), so it cannot be derived
    // during render — same pattern as the theme provider.
    /* eslint-disable react-hooks/set-state-in-effect */
    setIosInstall(needsIosInstall());
    setSupported(pushSupported());
    currentEndpoint().then((e) => setSubscribed(Boolean(e)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function enablePush() {
    const sub = await subscribeToPush(vapidPublicKey);
    if (!sub) {
      // Declined (or blocked at the OS level) — say so plainly and stop. Never
      // re-prompt: the browser wouldn't ask again anyway, and nagging is exactly
      // what D8 rules out.
      setSubscribed(false);
      return;
    }
    pushAct.run(
      () => savePushSubscription(sub),
      () => setSubscribed(true),
    );
  }

  async function disablePush() {
    const endpoint = await unsubscribeFromPush();
    if (!endpoint) {
      setSubscribed(false);
      return;
    }
    pushAct.run(
      () => removePushSubscription(endpoint),
      () => setSubscribed(false),
    );
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-6">
      {/* Identity */}
      <header className="flex flex-col items-center gap-2 pt-2 text-center">
        <Avatar name={name} size="xl" />
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">
            {name}
          </h1>
          <div className="mt-1 flex flex-wrap justify-center gap-1.5">
            {role === "owner" && <Badge variant="accent">Owner</Badge>}
            {role === "admin" && <Badge variant="primary">Co-admin</Badge>}
            {groupName && <Badge variant="neutral">{groupName}</Badge>}
          </div>
        </div>
        <p className="text-sm text-balance text-muted-foreground">
          You&apos;re someone who does dhikr daily.
        </p>
      </header>

      <Link
        href="/progress"
        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700">
            <FlameIcon className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Streak, badges &amp; consistency
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {streak}-day streak · view your Progress
            </p>
          </div>
        </div>
        <ChevronRightIcon className="size-5 text-muted-foreground" />
      </Link>

      {/* Reminders (D30) + push delivery (D10) */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Reminders
        </h2>

        {/* iOS can only push to an installed PWA — coach, don't show a dead button. */}
        {iosInstall ? (
          <Card className="p-4">
            <p className="text-sm font-medium text-foreground">
              Add Cetele to your Home Screen
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              On iPhone, reminders only work once Cetele is installed. Tap{" "}
              <span aria-hidden>􀈂</span> <strong>Share</strong> in Safari, then{" "}
              <strong>Add to Home Screen</strong> — and open Cetele from there.
            </p>
          </Card>
        ) : !supported ? (
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">
              This browser can&apos;t receive reminders. Try Chrome on Android,
              a desktop browser, or install Cetele to your iPhone&apos;s Home
              Screen.
            </p>
          </Card>
        ) : (
          <Card className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                Reminders on this device
              </p>
              <p className="text-xs text-muted-foreground">
                {subscribed
                  ? "You'll get a nudge at the times you set below."
                  : "Turn on to be reminded at the times you set below."}
              </p>
            </div>
            <Button
              variant={subscribed ? "outline" : "primary"}
              size="sm"
              disabled={pushAct.pending || subscribed === null}
              onClick={subscribed ? disablePush : enablePush}
            >
              {pushAct.pending ? "…" : subscribed ? "Turn off" : "Turn on"}
            </Button>
          </Card>
        )}
        {pushAct.error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {pushAct.error}
          </p>
        )}

        {/* Prove it end-to-end on a real phone: the push lands 10s later, so you
            can lock the screen and see it arrive the way a reminder would. */}
        {subscribed && <TestPushCard />}

        {tasks.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No tasks yet — reminders appear once your circle has some.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {tasks.map((t) => (
              <ReminderRow key={t.taskId} task={t} />
            ))}
          </ul>
        )}
      </section>

      {/* Appearance */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Appearance
        </h2>
        <Card className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Theme</p>
            <p className="text-xs text-muted-foreground">
              Easier on the eyes for night dhikr
            </p>
          </div>
          <ThemeToggle />
        </Card>
      </section>

      <form action="/auth/signout" method="post">
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}

/**
 * "Send a test notification" — fires a real push to this device 10 seconds from
 * now. The delay is the feature: it lets you lock the phone and confirm the
 * notification arrives with the app closed, which is the only thing that proves
 * reminders will actually work.
 */
function TestPushCard() {
  const act = useAction();
  const [sent, setSent] = React.useState(false);

  return (
    <Card className="mt-2 flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          Send a test notification
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {act.pending
            ? "Arriving in ~10 seconds — lock your phone and wait."
            : sent
              ? "Sent. If it didn't appear, check notifications are allowed for Cetele."
              : "Arrives in 10 seconds, so you can lock your phone and watch it land."}
        </p>
        {act.error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {act.error}
          </p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={act.pending}
        onClick={() => {
          setSent(false);
          act.run(
            () => sendTestPush(),
            () => setSent(true),
          );
        }}
      >
        {act.pending ? "Sending…" : "Test"}
      </Button>
    </Card>
  );
}

/** One task's reminder: a clock time the member picks, plus on/off (D30). */
function ReminderRow({ task }: { task: ReminderTask }) {
  const act = useAction();
  const [time, setTime] = React.useState(task.time);
  const [enabled, setEnabled] = React.useState(task.enabled);
  // Saves are serialised per row: picking a time and flipping the toggle fire
  // two writes in quick succession, and if they overlap on the wire the older
  // one can land last and undo the newer. Chaining keeps last-write-wins true.
  const queue = React.useRef<Promise<unknown>>(Promise.resolve());

  function save(nextTime: string, nextEnabled: boolean) {
    const prev = { time, enabled };
    // Optimistic — a time picker that lags behind your typing feels broken.
    setTime(nextTime);
    setEnabled(nextEnabled);
    act.run(
      () => {
        const next = queue.current.then(() =>
          setReminder(task.taskId, nextTime, nextEnabled),
        );
        queue.current = next.catch(() => {});
        return next;
      },
      undefined,
      () => {
        // …but never leave a refused write looking applied.
        setTime(prev.time);
        setEnabled(prev.enabled);
      },
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {task.label}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {task.groupName} · {enabled ? to12h(time) : "off"}
        </p>
        {act.error && (
          <p role="alert" className="mt-0.5 text-xs text-danger">
            {act.error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="time"
          value={time}
          aria-label={`Reminder time for ${task.label}`}
          onChange={(e) => save(e.target.value, enabled)}
          className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums"
        />
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Reminder for ${task.label}`}
          onClick={() => save(time, !enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-card shadow-sm transition-[left] ${
              enabled ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </li>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Screen,
  Spinner,
  cardVariants,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { FlameIcon, ChevronRightIcon } from "@/components/app/icons";
import {
  IosInstallGuide,
  UnsupportedBrowserNote,
  PushUnconfiguredNote,
} from "@/components/app/install-guide";
import { useAction } from "@/lib/use-action";
import { usePropState } from "@/lib/use-prop-state";
import {
  pushEnvironment,
  type PushEnvironment,
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
  deviceCount,
  vapidPublicKey,
}: {
  name: string;
  role: string | null;
  groupName: string | null;
  streak: number;
  tasks: ReminderTask[];
  /** How many of THIS MEMBER's devices are subscribed to push, across all of them. */
  deviceCount: number;
  vapidPublicKey: string;
}) {
  const pushAct = useAction();

  // Kept locally so enabling push unlocks the rows in the same interaction,
  // reconciled from each action's own outcome rather than a refetch (D45).
  const [devices, setDevices] = usePropState(deviceCount);

  // Whether THIS device is subscribed can only be answered by the browser — the
  // server knows the member's devices, not which one you're holding.
  const [subscribed, setSubscribed] = React.useState<boolean | null>(null);
  // `null` until the browser has been asked. Rendering the toggle while this is
  // unknown is what made the old UI misleading on iPhone: it showed a working
  // control first and corrected itself afterwards, which on a slow first paint
  // is indistinguishable from a control that works.
  const [env, setEnv] = React.useState<PushEnvironment | null>(null);

  React.useEffect(() => {
    // Mount-time capability catch-up. None of this exists during SSR (no
    // navigator, no PushManager, no service worker), so it cannot be derived
    // during render — same pattern as the theme provider.
    /* eslint-disable react-hooks/set-state-in-effect */
    setEnv(pushEnvironment(vapidPublicKey));
    currentEndpoint().then((e) => setSubscribed(Boolean(e)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [vapidPublicKey]);

  // The browser half (subscribe/unsubscribe) runs INSIDE pushAct.run, not
  // before it: pushManager.subscribe can reject (a push-service hiccup, an
  // enterprise policy), and awaited outside the runner that rejection escaped
  // as unhandled — the button did nothing, with no message.
  function enablePush() {
    pushAct.run(async () => {
      const result = await subscribeToPush(vapidPublicKey);
      if (!result.ok) {
        setSubscribed(false);
        // A decline is a normal answer — say nothing and never re-prompt: the
        // browser wouldn't ask again anyway, and nagging is what D8 rules out.
        if (result.reason === "declined") return { error: null };
        // Anything else means this device genuinely can't, whatever our
        // pre-flight thought. Re-resolve so the view swaps to the step the
        // member can actually take (install coaching) instead of a stuck error.
        setEnv(
          result.reason === "needs-install"
            ? "ios-needs-install"
            : "unsupported",
        );
        return { error: null };
      }
      const res = await savePushSubscription(result.keys);
      if (!res?.error) {
        setSubscribed(true);
        // Only count UP if this device wasn't already one of them — the RPC is an
        // upsert on the endpoint, so re-subscribing the same browser is not a new
        // device and must not inflate the count.
        if (!subscribed) setDevices((n) => n + 1);
      }
      return res;
    });
  }

  function disablePush() {
    pushAct.run(async () => {
      const endpoint = await unsubscribeFromPush();
      if (!endpoint) {
        setSubscribed(false);
        return { error: null };
      }
      const res = await removePushSubscription(endpoint);
      if (!res?.error) {
        setSubscribed(false);
        setDevices((n) => Math.max(0, n - 1));
      }
      return res;
    });
  }

  // Can a reminder time set here ever fire? Yes if any device is already
  // subscribed (set times on a laptop, receive on your phone — D42), and yes if
  // THIS device is push-capable, because then it is one tap away from being that
  // device. Otherwise no: an iPhone browser tab with no installed app can save a
  // time that nothing will ever deliver, and offering that is the contradiction
  // the install card was already warning about.
  const canReceiveHere = env === "ready";
  const remindersReachable = devices > 0 || canReceiveHere;

  return (
    <Screen>
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
        className={cn(
          cardVariants({ padding: "md" }),
          "flex items-center justify-between gap-3 transition-colors hover:bg-muted/50",
        )}
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

        {/* One value, four outcomes — and NO toggle until we know this device can
            honour it. iOS only pushes to an installed app, so there the install
            IS the setup: coach the step, never render a dead switch. */}
        {env === null ? (
          <Card className="flex items-center gap-3 p-4">
            <Spinner className="size-4" />
            <p className="text-xs text-muted-foreground">
              Checking whether this device can receive reminders…
            </p>
          </Card>
        ) : env === "ios-needs-install" ? (
          <IosInstallGuide />
        ) : env === "unconfigured" ? (
          <PushUnconfiguredNote />
        ) : env === "unsupported" ? (
          <UnsupportedBrowserNote />
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
          <>
            {/* Gated on REACHABILITY, not on this device: a time is stored on
                your account and dispatched to whichever devices are subscribed
                (D42), so a laptop tab may legitimately set times for a phone
                that is already installed. What must not happen is offering to
                turn a reminder on when NOTHING can deliver it — which is the
                contradiction of showing live switches under an install card. */}
            {!remindersReachable ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No device can receive reminders yet, so these are switched off
                until one can. Finish the steps above, open Cetele from your
                Home Screen, and turn reminders on there — your times are kept.
              </p>
            ) : (
              env !== null &&
              !canReceiveHere && (
                <p className="mt-2 text-xs text-muted-foreground">
                  These times are saved to your account, not to this browser —
                  they&apos;ll arrive on the{" "}
                  {devices === 1 ? "device" : `${devices} devices`} where
                  you&apos;ve turned reminders on.
                </p>
              )
            )}
            <ul className="mt-2 flex flex-col gap-1.5">
              {tasks.map((t) => (
                <ReminderRow
                  key={t.taskId}
                  task={t}
                  disabled={!remindersReachable}
                />
              ))}
            </ul>
          </>
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
    </Screen>
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

/**
 * One task's reminder: a clock time the member picks, plus on/off (D30).
 *
 * `disabled` is for the case where no device of the member's can receive a push
 * at all — the control is inert rather than hidden, because the task and its
 * time are still information worth seeing, and hiding them would make the whole
 * section vanish on an iPhone that hasn't installed the app yet.
 */
function ReminderRow({
  task,
  disabled = false,
}: {
  task: ReminderTask;
  disabled?: boolean;
}) {
  const act = useAction();
  // Prop-seeded (not a one-shot useState): useAction's post-save router.refresh
  // delivers the server's truth back through the prop, and re-seeding from it is
  // what reconciles a mixed-outcome pair of saves (time change failed, toggle
  // landed) — a plain useState would keep showing the rolled-back guess forever.
  const [time, setTime] = usePropState(task.time);
  const [enabled, setEnabled] = usePropState(task.enabled);
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
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5",
        // Dimmed, not hidden — and the label stays at full strength so the task
        // is still readable while its controls are inert.
        disabled && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {task.label}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {task.groupName} ·{" "}
          {disabled
            ? "needs a device that can receive"
            : enabled
              ? to12h(time)
              : "off"}
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
          disabled={disabled}
          aria-label={`Reminder time for ${task.label}`}
          onChange={(e) => save(e.target.value, enabled)}
          className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground tabular-nums disabled:cursor-not-allowed"
        />
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Reminder for ${task.label}`}
          disabled={disabled}
          onClick={() => save(time, !enabled)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed",
            enabled ? "bg-primary" : "bg-muted",
          )}
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

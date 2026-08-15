"use client";

import * as React from "react";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Input,
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
import { TaskLinks, type LinkCluster } from "@/components/app/task-links";
import { useAction } from "@/lib/use-action";
import { usePropState } from "@/lib/use-prop-state";
import { MAX_NAME_LENGTH } from "@/lib/profile";
import type { Suggestion } from "@/lib/task-links";
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
  deleteReminder,
  sendTestPush,
  updateName,
} from "./actions";

export type Reminder = {
  id: string;
  /** The member's own words — rendered as the push notification's title. */
  label: string;
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
  name: serverName,
  role,
  groupName,
  streak,
  reminders,
  linkClusters,
  linkSuggestions,
  multiCircle,
  deviceCount,
  vapidPublicKey,
}: {
  name: string;
  role: string | null;
  groupName: string | null;
  streak: number;
  reminders: Reminder[];
  /** The member's linked tasks, one entry per act (D64). */
  linkClusters: LinkCluster[];
  /** Cross-circle pairs worth offering — never linked automatically. */
  linkSuggestions: Suggestion[];
  /** Is the member in more than one circle? A link always spans two. */
  multiCircle: boolean;
  /** How many of THIS MEMBER's devices are subscribed to push, across all of them. */
  deviceCount: number;
  vapidPublicKey: string;
}) {
  const pushAct = useAction();

  // The name is edited on this screen, so it is held here rather than read
  // straight off the prop: the avatar's initials derive from it too, and the two
  // must never disagree mid-save. Prop-seeded so the server's value wins once
  // the refresh lands.
  const [name, setName] = usePropState(serverName);

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

  // Is a blank reminder being typed right now? Local and deliberately not a
  // route or a dialog — the draft is worth nothing until it is saved, so it
  // should cost nothing to abandon.
  const [adding, setAdding] = React.useState(false);

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
          <NameEditor name={name} onSaved={setName} />
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

        {/* Gated on REACHABILITY, not on this device: a time is stored on your
            account and dispatched to whichever devices are subscribed (D42), so
            a laptop tab may legitimately set times for a phone that is already
            installed. What must not happen is offering to turn a reminder on
            when NOTHING can deliver it — which is the contradiction of showing
            live switches under an install card.

            Above the empty/list split rather than inside the list, because it
            is the explanation for a DISABLED "Add a reminder" too: a member with
            no reminders and no device would otherwise meet a dead button and no
            reason for it, which is the same contradiction one level up. */}
        {!remindersReachable ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No device can receive reminders yet, so these are switched off until
            one can. Finish the steps above, open Cetele from your Home Screen,
            and turn reminders on there — your times are kept.
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

        {reminders.length === 0 && !adding ? (
          <div className="mt-2 rounded-xl border border-dashed border-border px-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No reminders yet. Add one and name it whatever you&apos;ll
              recognise at a glance — &ldquo;Evening dhikr&rdquo;.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={!remindersReachable}
              onClick={() => setAdding(true)}
            >
              Add a reminder
            </Button>
          </div>
        ) : (
          <>
            <ul className="mt-2 flex flex-col gap-1.5">
              {reminders.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  disabled={!remindersReachable}
                />
              ))}
              {/* The draft row is a list item like any other, so adding one
                  doesn't move the list or open a dialog over it — you type in
                  the place the reminder will live. */}
              {adding && (
                <NewReminderRow
                  onDone={() => setAdding(false)}
                  onCancel={() => setAdding(false)}
                />
              )}
            </ul>
            {!adding && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={!remindersReachable}
                onClick={() => setAdding(true)}
              >
                Add a reminder
              </Button>
            )}
          </>
        )}
      </section>

      {/* Linked tasks (D64) — the member's other cross-circle setting, next to
          reminders because both belong to the person rather than to a circle. */}
      <TaskLinks
        clusters={linkClusters}
        suggestions={linkSuggestions}
        multiCircle={multiCircle}
      />

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
 * The member's own display name, edited in place.
 *
 * In place rather than in a dialog because the name is already the largest thing
 * on this screen: the control belongs on the surface it governs (§4), and a
 * modal for one text field is a step nobody needs. The heading and the input
 * swap in the same slot, so nothing below moves.
 *
 * `act.error` renders only while editing, because `useAction` clears its error
 * on the next run and there is nothing to clear it on cancel — a stale message
 * left under the heading would outlive the attempt it described.
 */
function NameEditor({
  name,
  onSaved,
}: {
  name: string;
  onSaved: (next: string) => void;
}) {
  const act = useAction();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(name);
  const editButton = React.useRef<HTMLButtonElement>(null);
  const field = React.useRef<HTMLInputElement>(null);

  function close() {
    setEditing(false);
    // The control the member was on is about to unmount; without this, focus
    // falls to the body and a keyboard user restarts from the top of the page.
    editButton.current?.focus();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (draft.trim() === name) {
      close();
      return;
    }
    // Empty is NOT short-circuited here — the action owns that message, and one
    // wasted round trip on a rare mistake beats two copies of the rule.
    act.run(
      () => updateName(draft),
      (res) => {
        if (res.name) onSaved(res.name);
        close();
      },
      // The field is disabled for the duration of the write, and disabling an
      // element drops focus to the body — so a refused save would otherwise
      // leave a keyboard user reading an error with no way back to the input
      // except to hunt for it.
      () => field.current?.focus(),
    );
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-center gap-2">
        <h1 className="font-display text-xl font-bold text-foreground">
          {name}
        </h1>
        <Button
          ref={editButton}
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          Edit
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col items-center gap-2">
      <Input
        ref={field}
        value={draft}
        autoFocus
        maxLength={MAX_NAME_LENGTH}
        aria-label="Your name"
        disabled={act.pending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        className="max-w-64 text-center"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={act.pending}>
          {act.pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={act.pending}
          onClick={close}
        >
          Cancel
        </Button>
      </div>
      {act.error && (
        <p role="alert" className="text-xs text-danger">
          {act.error}
        </p>
      )}
    </form>
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
 * The controls shared by a saved reminder and a draft one: the name, the clock
 * time, and (for a saved row) the on/off switch.
 *
 * `disabled` is for the case where no device of the member's can receive a push
 * at all — the controls are inert rather than hidden, because a reminder and its
 * time are still information worth seeing, and hiding them would make the whole
 * section vanish on an iPhone that hasn't installed the app yet.
 */
function ReminderFields({
  label,
  time,
  onLabel,
  onLabelBlur,
  onTime,
  disabled,
  labelId,
  autoFocus = false,
}: {
  label: string;
  time: string;
  onLabel: (v: string) => void;
  /** Saved-row only: the draft has an explicit Save button instead. */
  onLabelBlur?: () => void;
  onTime: (v: string) => void;
  disabled: boolean;
  labelId: string;
  autoFocus?: boolean;
}) {
  return (
    <>
      <Input
        value={label}
        disabled={disabled}
        // 60 is the DB's constraint (0033). Enforced here too so the limit is
        // felt as the field refusing the 61st character rather than as an error
        // message after a save — the check constraint stays the authority.
        maxLength={60}
        autoFocus={autoFocus}
        aria-label="Reminder name"
        id={labelId}
        placeholder="Evening dhikr"
        onChange={(e) => onLabel(e.target.value)}
        onBlur={onLabelBlur}
        // Enter commits the same way leaving the field does, so the name can be
        // saved without reaching for anything — and the blur it triggers is what
        // actually performs the save, rather than a second path to keep in step.
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-9"
      />
      <input
        type="time"
        value={time}
        disabled={disabled}
        aria-label="Reminder time"
        onChange={(e) => onTime(e.target.value)}
        // The controls carry their own disabled treatment — token pair,
        // matching Input — because the row recedes by SURFACE, not opacity.
        className="h-9 shrink-0 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground tabular-nums disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-fill disabled:text-disabled-foreground"
      />
    </>
  );
}

/**
 * One of the member's own reminders: a name they wrote, a clock time, on/off,
 * and a way to delete it (D62).
 *
 * The name is saved on BLUR, not on every keystroke: it is free text, so a
 * per-character save would send a write for "E", "Ev", "Eve"… and the last one
 * to land wins. The time and the toggle still save immediately — they are
 * single-gesture controls with nothing to debounce.
 */
function ReminderRow({
  reminder,
  disabled = false,
}: {
  reminder: Reminder;
  disabled?: boolean;
}) {
  const act = useAction();
  const del = useAction();
  // Prop-seeded (not a one-shot useState): useAction's post-save router.refresh
  // delivers the server's truth back through the prop, and re-seeding from it is
  // what reconciles a mixed-outcome pair of saves (name change failed, toggle
  // landed) — a plain useState would keep showing the rolled-back guess forever.
  const [label, setLabel] = usePropState(reminder.label);
  const [time, setTime] = usePropState(reminder.time);
  const [enabled, setEnabled] = usePropState(reminder.enabled);
  // Saves are serialised per row: editing the name and flipping the toggle fire
  // two writes in quick succession, and if they overlap on the wire the older
  // one can land last and undo the newer. Chaining keeps last-write-wins true.
  const queue = React.useRef<Promise<unknown>>(Promise.resolve());

  function save(nextLabel: string, nextTime: string, nextEnabled: boolean) {
    const trimmed = nextLabel.trim();
    const prev = { label, time, enabled };
    // An empty name is the one thing the server refuses outright, so it is
    // caught here as a REVERT rather than sent and rendered as an error: the
    // member has emptied a field, not asked for anything.
    if (!trimmed) {
      setLabel(prev.label);
      return;
    }
    // Optimistic — a control that lags behind your typing feels broken.
    setLabel(trimmed);
    setTime(nextTime);
    setEnabled(nextEnabled);
    act.run(
      () => {
        const next = queue.current.then(() =>
          setReminder(reminder.id, trimmed, nextTime, nextEnabled),
        );
        queue.current = next.catch(() => {});
        return next;
      },
      undefined,
      () => {
        // …but never leave a refused write looking applied.
        setLabel(prev.label);
        setTime(prev.time);
        setEnabled(prev.enabled);
      },
    );
  }

  return (
    <li
      className={cn(
        "rounded-xl border border-border bg-card px-3 py-2.5",
        // The row recedes by SURFACE, not by opacity: container-level opacity
        // fades every descendant, the explanation of WHY the controls are inert
        // included — and that explanation is the one thing a member must be
        // able to read here.
        disabled && "bg-muted/60",
      )}
    >
      <div className="flex items-center gap-2">
        <ReminderFields
          label={label}
          time={time}
          onLabel={setLabel}
          onLabelBlur={() => save(label, time, enabled)}
          onTime={(v) => save(label, v, enabled)}
          disabled={disabled}
          labelId={`reminder-name-${reminder.id}`}
        />
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Reminder ${label}`}
          disabled={disabled}
          onClick={() => save(label, time, !enabled)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed",
            enabled ? "bg-primary" : "bg-muted",
            disabled && "bg-disabled-fill",
          )}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-card shadow-sm transition-[left] ${
              enabled ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="truncate text-xs text-muted-foreground">
          {disabled
            ? "needs a device that can receive"
            : enabled
              ? to12h(time)
              : "off"}
        </p>
        <button
          type="button"
          disabled={del.pending}
          onClick={() => del.run(() => deleteReminder(reminder.id))}
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-danger disabled:cursor-not-allowed"
        >
          {del.pending ? "Removing…" : "Remove"}
        </button>
      </div>
      {(act.error || del.error) && (
        <p role="alert" className="mt-0.5 text-xs text-danger">
          {act.error ?? del.error}
        </p>
      )}
    </li>
  );
}

/**
 * The draft row — a reminder being typed, not yet saved. Separate from
 * `ReminderRow` because it has no id, nothing to toggle and nothing to delete:
 * modelling it as an "empty reminder" would have meant a row that is sometimes
 * real and sometimes not, checked in every handler.
 */
function NewReminderRow({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const act = useAction();
  const [label, setLabel] = React.useState("");
  const [time, setTime] = React.useState("07:00");

  const trimmed = label.trim();

  return (
    <li className="rounded-xl border border-primary bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <ReminderFields
          label={label}
          time={time}
          onLabel={setLabel}
          onTime={setTime}
          disabled={act.pending}
          labelId="reminder-name-new"
          autoFocus
        />
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={act.pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          // Guarded rather than left to fail: the server refuses a blank name
          // out loud (0033), but a button that can only ever produce an error
          // is a worse teacher than one that plainly isn't ready yet.
          disabled={act.pending || trimmed.length === 0}
          onClick={() =>
            act.run(() => setReminder(null, trimmed, time, true), onDone)
          }
        >
          {act.pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {act.error && (
        <p role="alert" className="mt-0.5 text-xs text-danger">
          {act.error}
        </p>
      )}
    </li>
  );
}

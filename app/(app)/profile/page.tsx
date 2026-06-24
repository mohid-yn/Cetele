"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { FlameIcon, ShieldIcon } from "@/components/demo/icons";

function Toggle({
  label,
  hint,
  defaultOn = false,
}: {
  label: string;
  hint?: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = React.useState(defaultOn);
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => setOn((v) => !v)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-[var(--duration-fast)]",
          on ? "bg-accent" : "bg-neutral-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-neutral-0 shadow-sm transition-[left] duration-[var(--duration-fast)]",
            on ? "left-[1.375rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { state } = useMock();
  const me = sel.currentUser(state);
  const group = sel.activeGroup(state);
  const role = sel.membershipRole(state, me.id, group.id);
  const streak = sel.streak(state, me.id);

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-6">
      {/* Identity */}
      <header className="flex flex-col items-center gap-2 pt-2 text-center">
        <Avatar name={me.name} size="xl" />
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">
            {me.name}
          </h1>
          <div className="mt-1 flex flex-wrap justify-center gap-1.5">
            {role === "group_admin" && (
              <Badge variant="primary">Group admin</Badge>
            )}
            {me.isAdmin && <Badge variant="accent">App admin</Badge>}
            <Badge variant="neutral">{group.name}</Badge>
          </div>
        </div>
        <p className="text-sm text-balance text-muted-foreground">
          You&apos;re someone who does dhikr daily.
        </p>
      </header>

      {/* Streak hero */}
      <Card className="bg-primary p-5 text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-foreground/10">
            <FlameIcon className="size-8 text-accent" />
          </div>
          <div>
            <p className="font-display text-4xl font-bold tabular-nums">
              {streak?.current ?? 0}
            </p>
            <p className="text-sm text-primary-foreground/70">day streak</p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-display text-2xl font-bold tabular-nums">
              {streak?.longest ?? 0}
            </p>
            <p className="text-xs text-primary-foreground/70">longest</p>
          </div>
        </div>
      </Card>

      {/* Never miss twice */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-success-500/15 text-success">
            <ShieldIcon className="size-5" />
          </div>
          <div className="flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Never miss twice
              <Badge variant="success" size="sm">
                {streak?.freezesLeft ?? 0} freeze
                {(streak?.freezesLeft ?? 0) === 1 ? "" : "s"} left
              </Badge>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Miss a day and a streak-freeze keeps your streak alive — once. The
              point is to come back, not to be perfect.
            </p>
          </div>
        </div>
      </Card>

      {/* Settings (mock) */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">Settings</h2>
        <Card className="divide-y divide-border px-4 py-1">
          <Toggle
            label="Daily reminder"
            hint="Push when you haven't logged today"
            defaultOn
          />
          <Toggle label="Tap sound" defaultOn />
          <Toggle label="Haptics" defaultOn />
        </Card>
      </section>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => router.push("/")}
      >
        Sign out
      </Button>
    </div>
  );
}

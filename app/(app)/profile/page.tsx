"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar, Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { FlameIcon, ChevronRightIcon } from "@/components/demo/icons";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Reminders } from "@/components/demo/reminders";

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
            {role === "owner" && <Badge variant="accent">Owner</Badge>}
            {role === "admin" && <Badge variant="primary">Co-admin</Badge>}
            <Badge variant="neutral">{group.name}</Badge>
          </div>
        </div>
        <p className="text-sm text-balance text-muted-foreground">
          You&apos;re someone who does dhikr daily.
        </p>
      </header>

      {/* Streak / badges / consistency now live on Progress — link there */}
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
              {streak?.current ?? 0}-day streak · view your Progress
            </p>
          </div>
        </div>
        <ChevronRightIcon className="size-5 text-muted-foreground" />
      </Link>

      {/* Reminders + habit-stacking (CET-11) */}
      <Reminders />

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

      {/* Settings (mock) */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">Settings</h2>
        <Card className="divide-y divide-border px-4 py-1">
          <Toggle label="Tap sound" defaultOn />
          <Toggle label="Haptics" defaultOn />
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

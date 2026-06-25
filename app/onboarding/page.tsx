"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, ProgressRing } from "@/components/ui";
import { UsersIcon, PlusIcon, CheckIcon } from "@/components/demo/icons";

type Mode = "choose" | "join" | "create" | "welcome";

export default function OnboardingPage() {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("choose");
  const [code, setCode] = React.useState("FAJR-7K2");
  const [name, setName] = React.useState("");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Welcome 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Join your circle, or start a new one.
        </p>
      </div>

      {mode === "choose" && (
        <div className="flex flex-col gap-3">
          <Card
            className="cursor-pointer p-4 transition-colors hover:bg-muted/60"
            onClick={() => setMode("join")}
          >
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-full bg-primary-100 text-primary-700">
                <UsersIcon className="size-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Join a group</p>
                <p className="text-sm text-muted-foreground">
                  You have an invite code
                </p>
              </div>
            </div>
          </Card>

          <Card
            className="cursor-pointer p-4 transition-colors hover:bg-muted/60"
            onClick={() => setMode("create")}
          >
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-full bg-accent-100 text-accent-700">
                <PlusIcon className="size-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Create a group</p>
                <p className="text-sm text-muted-foreground">
                  Start a cetele for your circle
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {mode === "join" && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">
            Enter your invite code
          </p>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD-1234"
            className="text-center font-mono tracking-widest"
          />
          <Button
            variant="accent"
            className="mt-3 w-full"
            onClick={() => setMode("welcome")}
          >
            Join group
          </Button>
          <Button
            variant="ghost"
            className="mt-1 w-full"
            onClick={() => setMode("choose")}
          >
            Back
          </Button>
        </Card>
      )}

      {mode === "create" && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">
            Name your group
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fajr Circle"
          />
          <Button
            variant="accent"
            className="mt-3 w-full"
            disabled={!name.trim()}
            onClick={() => setMode("welcome")}
          >
            Create &amp; continue
          </Button>
          <Button
            variant="ghost"
            className="mt-1 w-full"
            onClick={() => setMode("choose")}
          >
            Back
          </Button>
        </Card>
      )}

      {/* Endowed-progress onboarding (CET-21): day one already has momentum. */}
      {mode === "welcome" && (
        <Card className="p-5 text-center">
          <p className="font-display text-lg font-bold text-foreground">
            You&apos;re in! 🎉
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            And you&apos;re not starting from zero.
          </p>

          <div className="my-5 flex justify-center">
            <ProgressRing value={2} max={5} size={120} thickness={12}>
              <div className="text-center">
                <span className="font-display text-2xl font-bold text-foreground tabular-nums">
                  40%
                </span>
                <span className="block text-xs text-muted-foreground">
                  today
                </span>
              </div>
            </ProgressRing>
          </div>

          <p className="text-sm text-balance text-muted-foreground">
            Your circle is already <strong>40% toward today&apos;s goal</strong>
            , and we&apos;ve credited your first <strong>10 SubhanAllah</strong>{" "}
            to get you moving. The chain has begun — keep it going.
          </p>

          <ul className="mt-4 flex flex-col gap-1.5 text-left text-sm">
            {[
              "Your first contribution is logged",
              "Today's streak is started",
            ].map((line) => (
              <li key={line} className="flex items-center gap-2">
                <CheckIcon className="size-4 shrink-0 text-success" />
                <span className="text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>

          <Button
            variant="accent"
            className="mt-5 w-full"
            onClick={() => router.push("/today")}
          >
            Start counting
          </Button>
        </Card>
      )}
    </main>
  );
}

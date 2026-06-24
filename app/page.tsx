"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { GoogleIcon, MailIcon } from "@/components/demo/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col justify-center gap-8 px-6 py-10">
      {/* Wordmark */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          aria-hidden
          className="size-16 rounded-full border-8 border-brand"
          style={{ borderTopColor: "transparent" }}
        />
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-brand">
            Cetele
          </h1>
          <p className="mt-1 max-w-xs text-sm text-balance text-muted-foreground">
            Track your daily dhikr together. A shared tally that makes
            remembrance a habit.
          </p>
        </div>
      </div>

      {/* Auth (faked) */}
      <div className="flex flex-col gap-3">
        <Button
          variant="outline"
          className="w-full"
          leadingIcon={<GoogleIcon />}
          onClick={() => router.push("/today")}
        >
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        {sent ? (
          <div className="rounded-2xl border border-border bg-card p-4 text-center">
            <MailIcon className="mx-auto size-7 text-primary" />
            <p className="mt-2 text-sm font-medium text-foreground">
              Check your email
            </p>
            <p className="text-xs text-muted-foreground">
              We sent a magic link to {email || "you"}.
            </p>
            <Button
              variant="accent"
              className="mt-3 w-full"
              onClick={() => router.push("/onboarding")}
            >
              Open the link →
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
          >
            <Input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              leadingIcon={<MailIcon />}
            >
              Email me a magic link
            </Button>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Just exploring?{" "}
        <Link
          href="/today"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Skip into the demo
        </Link>
      </p>
    </main>
  );
}

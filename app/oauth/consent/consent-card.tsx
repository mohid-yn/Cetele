"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui";
import { WebAppLogo } from "@/components/ui/logo";

function SubmitButton(props: ButtonProps) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} {...props} />;
}

export type ConsentView =
  | { kind: "ask"; clientName: string; destination: string; email: string }
  | { kind: "not-organiser" }
  | { kind: "unavailable" };

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-4 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6">
        <WebAppLogo className="h-8 w-auto self-start" />
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/** The screen where a person approves or refuses an AI app. */
export function ConsentCard({
  view,
  authorizationId,
  writesEnabled,
  approve,
  deny,
}: {
  view: ConsentView;
  authorizationId: string;
  writesEnabled: boolean;
  approve: (formData: FormData) => Promise<void>;
  deny: (formData: FormData) => Promise<void>;
}) {
  const hidden = (
    <input type="hidden" name="authorization_id" value={authorizationId} />
  );

  if (view.kind === "unavailable") {
    return (
      <Shell title="This connection can't be completed">
        <p className="text-foreground">
          The request has expired or isn&apos;t allowed. Go back to Claude and
          connect again.
        </p>
      </Shell>
    );
  }

  if (view.kind === "not-organiser") {
    return (
      <Shell title="Only organisers can connect">
        <p className="text-foreground">
          This connection is for people who organise programmes in Cetele, and
          your account isn&apos;t an organiser.
        </p>
        <form action={deny}>
          {hidden}
          <SubmitButton variant="outline" className="w-full">
            Go back
          </SubmitButton>
        </form>
      </Shell>
    );
  }

  return (
    <Shell title={`Connect ${view.clientName} to Cetele?`}>
      <p className="text-foreground">
        It will act as <strong className="break-all">{view.email}</strong>, and
        your name will appear on its changes.
      </p>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">It can</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-foreground">
          <li>Read your programmes</li>
          {writesEnabled && <li>Create and edit unpublished drafts</li>}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">It can&apos;t</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-foreground">
          <li>Publish or change a live programme</li>
          <li>See members, circles or anyone&apos;s progress</li>
        </ul>
      </div>

      <p className="text-sm text-muted-foreground">
        You&apos;ll be sent back to{" "}
        <strong className="text-foreground">{view.destination}</strong>.
      </p>

      <div className="flex flex-col gap-3">
        <form action={approve}>
          {hidden}
          <SubmitButton className="w-full">Allow</SubmitButton>
        </form>
        <form action={deny}>
          {hidden}
          <SubmitButton variant="outline" className="w-full">
            Cancel
          </SubmitButton>
        </form>
      </div>
    </Shell>
  );
}

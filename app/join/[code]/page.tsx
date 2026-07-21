import Link from "next/link";
import { buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import { UsersIcon } from "@/components/app/icons";
import { createClient } from "@/lib/supabase/server";
import { AcceptButton } from "./join-client";

/**
 * /join/[code] — where a shared invite link lands (D34/D35). The proxy gate
 * has already forced sign-in (carrying this path via ?next=), so the caller
 * has a verified email; lookup_invite tells us everything else. States:
 * invalid/revoked code · locked to a different email · already a member ·
 * joinable.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("lookup_invite", { p_code: code });
  const invite = data?.[0];

  let body: React.ReactNode;

  if (!invite) {
    body = (
      <>
        <p className="text-sm font-medium text-foreground">
          This invite link isn&rsquo;t valid
        </p>
        <p className="text-xs text-muted-foreground">
          It may have been revoked, already used, or mistyped. Ask the person
          who shared it for a fresh link.
        </p>
        <Link href="/groups" className={buttonVariants({ variant: "outline" })}>
          Go to your groups
        </Link>
      </>
    );
  } else if (invite.already_member) {
    body = (
      <>
        <p className="text-sm font-medium text-foreground">
          You&rsquo;re already in {invite.group_name}
        </p>
        <p className="text-xs text-muted-foreground">
          Nothing to do — you&rsquo;re a member of this group.
        </p>
        <Link href="/groups" className={buttonVariants({ variant: "primary" })}>
          Open your groups
        </Link>
      </>
    );
  } else if (!invite.email_matches) {
    body = (
      <>
        <p className="text-sm font-medium text-foreground">
          This invite is locked to a different email
        </p>
        <p className="text-xs text-muted-foreground">
          Sign in with the email address the invite was created for, or ask for
          an open invite link.
        </p>
        <Link href="/groups" className={buttonVariants({ variant: "outline" })}>
          Go to your groups
        </Link>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-sm font-medium text-foreground">
          You&rsquo;ve been invited to {invite.group_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {invite.invite_role === "admin"
            ? "You'll join as a co-admin — helping run the group's tasks and members."
            : "You'll join as a member and follow the group's shared daily tasks."}
        </p>
        <AcceptButton code={code} />
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
          <UsersIcon className="size-7" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-brand">
          Cetele
        </h1>
      </div>
      <div
        className={cn(
          cardVariants({ padding: "md" }),
          "flex flex-col gap-3 text-center",
        )}
      >
        {body}
      </div>
    </main>
  );
}

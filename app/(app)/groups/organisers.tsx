"use client";

import * as React from "react";
import { Button, Card, ConfirmDialog, Field, Input } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { grantSuperAdmin, revokeSuperAdmin } from "./actions";

export type Organiser = { userId: string; name: string | null; email: string };

/**
 * Who holds the administration's role, and the controls to change it (D56).
 *
 * WHY THIS EXISTS AT ALL. D27 made `is_super_admin` settable "only directly in
 * Supabase", and the reason given was self-escalation — an ordinary compromised
 * account grabbing power. That reason still holds and nothing here weakens it:
 * every control below calls an RPC that refuses unless the caller is ALREADY an
 * organiser. What changed is that 0025 turned the flag from a break-glass
 * recovery switch into the reader for the programme report, and "ask whoever
 * has the Supabase password" is the wrong answer for an ordinary administrative
 * role — it makes the project depend on one person, which is the bottleneck D27
 * existed to remove.
 *
 * APPOINTMENT IS BY EXACT EMAIL, and there is no picker, on purpose. A
 * browsable list of everyone in the app is the god view D26/D27 refuses, and
 * this screen is the one place it would be tempting to build one. You have to
 * already know who you are appointing.
 *
 * The roster shows EMAIL beside the name because a name does not identify a
 * person — two members called Ahmad are two rows, and standing the wrong one
 * down is silent.
 */
export function Organisers({
  organisers,
  me,
}: {
  organisers: Organiser[];
  /** The viewer, so their own row can be named as theirs. */
  me: string;
}) {
  const [email, setEmail] = React.useState("");
  const [pendingRemoval, setPendingRemoval] = React.useState<Organiser | null>(
    null,
  );
  const grant = useAction();
  const revoke = useAction();

  const last = organisers.length === 1;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Organisers</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Organisers see how far everyone has got on a programme. They see
          nothing else — no circle&rsquo;s dhikr, no streaks, no daily figures.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {organisers.map((o) => (
          <li key={o.userId} className="flex items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {o.name ?? "Unnamed"}
                {o.userId === me && (
                  <span className="text-muted-foreground"> (you)</span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {o.email}
              </p>
            </div>
            {/* The last organiser has no Remove button at all, rather than one
                that fails when pressed. The database refuses it either way
                (that is where the rule has to live — it needs a lock), but a
                control that cannot succeed should not be offered. */}
            {!last && (
              <Button
                variant="outline"
                size="sm"
                disabled={revoke.pending}
                onClick={() => setPendingRemoval(o)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>

      {last && (
        <p className="text-xs text-muted-foreground">
          This is the only organiser, so they cannot be removed — appoint
          another first. An app with no organiser can only be recovered from
          Supabase.
        </p>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void grant.run(
            () => grantSuperAdmin(email),
            () => setEmail(""),
          );
        }}
      >
        <Field
          label="Appoint an organiser"
          htmlFor="organiser-email"
          hint="Their exact email address — there is no directory to search."
        >
          <Input
            id="organiser-email"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          variant="outline"
          disabled={!email.trim() || grant.pending}
        >
          {grant.pending ? "Appointing…" : "Appoint"}
        </Button>
        {grant.error && (
          <p role="alert" className="text-xs text-danger">
            {grant.error}
          </p>
        )}
      </form>

      {revoke.error && (
        <p role="alert" className="text-xs text-danger">
          {revoke.error}
        </p>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onClose={() => setPendingRemoval(null)}
        title="Remove this organiser?"
        // Naming the person and saying what it costs them, because the roster
        // is a list of near-identical rows and the mistake this guards is
        // pressing Remove on the line above the one you meant.
        description={
          pendingRemoval
            ? `${pendingRemoval.name ?? pendingRemoval.email} will stop being an organiser and will no longer see the programme report.${
                pendingRemoval.userId === me
                  ? " This is you — you will lose access as soon as it is done."
                  : ""
              }`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => {
          const target = pendingRemoval;
          setPendingRemoval(null);
          if (target) void revoke.run(() => revokeSuperAdmin(target.userId));
        }}
      />
    </Card>
  );
}

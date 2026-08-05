import Link from "next/link";
import { buttonVariants, Card, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { FlagIcon } from "@/components/app/icons";
import { cn } from "@/lib/utils";

/**
 * This circle follows no programme.
 *
 * Reachable only by a typed URL or a kept link — the nav tab is conditional
 * (D55) — so this is a rare screen, and the temptation is to redirect. It does
 * not: a redirect from a link someone was given reads as "the page is broken",
 * and an admin arriving here is one tap from the control that fixes it. A
 * member gets the same explanation without a button they cannot use.
 */
export function NoRoadmap({
  groupId,
  canFollow,
}: {
  groupId: string;
  /** Owner or co-admin — only they can put a circle on a programme. */
  canFollow: boolean;
}) {
  return (
    <Screen>
      <PageHeader
        title="Roadmap"
        subtitle="A yearly programme, followed by a circle"
      />

      <Card padding="md">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <FlagIcon aria-hidden className="size-6" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            This circle isn&rsquo;t following a programme
          </p>
          <p className="max-w-xs text-sm text-balance text-muted-foreground">
            {canFollow
              ? "Choose one in Manage and it will appear here for everyone in the circle."
              : "If your circle joins one, it will appear here."}
          </p>
          {/* `buttonVariants` on a real anchor — the primitive renders a
              <button>, and this navigates. Same reason the roadmap item card
              styles its outbound link this way. */}
          {canFollow && (
            <Link
              href={`/g/${groupId}/group/manage`}
              className={cn(buttonVariants({ variant: "outline" }), "mt-1")}
            >
              Open Manage
            </Link>
          )}
        </div>
      </Card>
    </Screen>
  );
}

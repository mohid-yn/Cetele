import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "@/components/app/icons";
import { PageHeader } from "@/components/app/page-header";
import { Card, Screen } from "@/components/ui";
import { q } from "@/lib/db-log";
import { CLAUDE_CLIENT_ID, readMcpConfig } from "@/lib/mcp-policy";
import { createClient } from "@/lib/supabase/server";
import { ConnectGuide } from "./connect-guide";

export const metadata: Metadata = { title: "Connect Claude · Cetele" };

/**
 * Setup steps for the MCP connector (docs/MCP_PLAN.md). For organisers only,
 * because nobody else can use the connector, not because anything here is secret.
 */
export default async function ConnectPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const me = auth?.claims?.sub;
  if (!me) redirect("/");

  const { data: viewer } = await q(
    "programmeConnect.viewer (is_super_admin)",
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", me)
      .maybeSingle(),
  );
  if (viewer?.is_super_admin !== true) redirect("/programme");

  const config = readMcpConfig(process.env);
  const available =
    config.enabled && config.allowedClients.includes(CLAUDE_CLIENT_ID);

  // The address this page was reached on, so the steps are right on any host.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";

  return (
    <Screen>
      <Link
        href="/programme"
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start px-2 py-2 text-sm font-medium text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden className="size-4" /> Roadmaps
      </Link>
      <PageHeader title="Connect Claude" />
      {available ? (
        <ConnectGuide
          serverUrl={`${protocol}://${host}/api/mcp`}
          clientId={CLAUDE_CLIENT_ID}
        />
      ) : (
        <Card padding="md">
          <p className="text-sm text-foreground">
            Connecting Claude isn&apos;t switched on right now.
          </p>
        </Card>
      )}
    </Screen>
  );
}

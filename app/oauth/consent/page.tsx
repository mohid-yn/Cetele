import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readMcpConfig } from "@/lib/mcp-policy";
import { approveConsent, denyConsent, switchConsentAccount } from "./actions";
import { ConsentCard, type ConsentView } from "./consent-card";
import { loadConsentRequest } from "./load";

export const metadata: Metadata = {
  title: "Connect an app · Cetele",
  robots: { index: false },
};

/**
 * Where Supabase sends someone to approve an AI app (docs/MCP_PLAN.md). Its path
 * is set in Supabase's OAuth server settings. Signed-out visitors are sent to log
 * in by the proxy, which keeps this page's query for this one route.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string | string[] }>;
}) {
  const { authorization_id: raw } = await searchParams;
  const authorizationId = typeof raw === "string" ? raw : "";

  const request = authorizationId
    ? await loadConsentRequest(authorizationId)
    : ({ kind: "invalid" } as const);

  if (request.kind === "signed-out") {
    redirect(
      `/?next=${encodeURIComponent(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`)}`,
    );
  }
  if (request.kind === "already-approved") redirect(request.redirectUrl);

  let view: ConsentView;
  if (request.kind === "ask") view = request;
  else if (request.kind === "refused" && request.reason === "not-organiser") {
    view = { kind: "not-organiser", email: request.email };
  } else view = { kind: "unavailable" };

  return (
    <ConsentCard
      view={view}
      authorizationId={authorizationId}
      writesEnabled={readMcpConfig(process.env).writesEnabled}
      approve={approveConsent}
      deny={denyConsent}
      switchAccount={switchConsentAccount}
    />
  );
}

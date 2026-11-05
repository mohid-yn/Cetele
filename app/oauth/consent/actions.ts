"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadConsentRequest } from "./load";

const backToPage = (authorizationId: string): never =>
  redirect(
    `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`,
  );

/** Re-checks everything: this is reachable without the page that offers it. */
export async function approveConsent(formData: FormData): Promise<void> {
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const request = await loadConsentRequest(authorizationId);
  if (request.kind !== "ask") return backToPage(authorizationId);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.approveAuthorization(
    authorizationId,
    {
      skipBrowserRedirect: true,
    },
  );
  if (error || !data) return backToPage(authorizationId);
  redirect(data.redirect_url);
}

/** Tells the waiting app no. Offered on every screen that has a live request. */
export async function denyConsent(formData: FormData): Promise<void> {
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(
    authorizationId,
    { skipBrowserRedirect: true },
  );
  if (error || !data) return redirect("/");
  redirect(data.redirect_url);
}

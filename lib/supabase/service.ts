import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client — BYPASSES RLS. Server-only, and only for the
 * push dispatcher (`/api/push/dispatch`), which acts for the system rather than
 * for a signed-in user: it claims due reminders across every member and prunes
 * dead subscriptions.
 *
 * Never import this into a component, a Server Action, or anything reachable
 * from a request a user controls. Everything user-facing goes through
 * `lib/supabase/server.ts`, under RLS.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

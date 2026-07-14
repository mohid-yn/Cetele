import { CelebrationProvider } from "@/components/app/celebration";
import { AppFrame } from "@/components/app/app-frame";

/**
 * Shell for every in-app screen: the celebration layer + the app frame.
 *
 * M9: the MockStateProvider is gone — every screen reads Supabase now, and no
 * `lib/mock` import remains anywhere in the app.
 *
 * DELIBERATELY DOES NO AUTH AND NO DB WORK. Mounting TimezoneSync here (with the
 * `getClaims()` + profile read it needs) looked like the tidy home for it — the
 * timezone is a property of the person, not a page — but it took the e2e suite
 * from 15/15 to 7/15: sessions came apart under load and pages rendered as if
 * signed out (a freshly-created group showing "My groups (0)"). The layout wraps
 * EVERY request, so per-request auth work here is multiplied across the whole
 * app. Screens fetch their own data; the shell stays inert.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CelebrationProvider>
      <AppFrame>{children}</AppFrame>
    </CelebrationProvider>
  );
}

import * as React from "react";
import { cookies } from "next/headers";
import { ACTIVE_GROUP_COOKIE } from "@/lib/group-href";
import { APP_SCROLL_ID } from "@/lib/app-scroll";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";

/**
 * Responsive app shell (UI_PRACTICES §3). Mobile: a centred single column with
 * a bottom tab bar. Desktop (≥lg): a persistent left sidebar with a wider
 * content column. Same routes, re-housed.
 *
 * M9: the "DEMO · mock data" ribbon and the floating Demo Controls are gone with
 * the mock — every screen is served from Supabase now, so there is nothing to
 * disclaim and nothing to simulate. With them went the only state this held, so
 * it is a server component again.
 */
export async function AppFrame({ children }: { children: React.ReactNode }) {
  // A cheap server-side hint for the nav's FIRST paint: read the active-group
  // cookie only — reading a cookie is local request data, NOT the auth/DB work
  // the shell deliberately avoids (see layout.tsx). A returning member has this
  // cookie (set on every circle visit) → full nav with no flash; a brand-new or
  // just-left user has none → pristine "no circle" front door from frame one.
  // The client store (useHasGroups) confirms/corrects it after mount; the id also
  // seeds the group-tab hrefs so they're right at SSR, not only after hydration.
  const initialGroupId =
    (await cookies()).get(ACTIVE_GROUP_COOKIE)?.value ?? null;
  const initialHasGroups = initialGroupId !== null;

  return (
    // A real app shell: the frame is exactly one viewport tall and the CONTENT
    // scrolls inside it. Previously the whole document scrolled while the
    // bottom nav was `sticky bottom-0`, so on any screen taller than the
    // viewport the nav sat on top of the last element — the count screen's
    // primary action was covered on a 667px-tall phone. Giving the scroll to
    // `main` means the nav is a sibling of the scroll region, never over it,
    // and no screen has to reserve space for it.
    <div className="flex h-dvh bg-background">
      <Sidebar
        initialHasGroups={initialHasGroups}
        initialGroupId={initialGroupId}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main
          id={APP_SCROLL_ID}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col lg:max-w-[var(--container-page)]">
            {children}
          </div>
        </main>
        <BottomNav
          initialHasGroups={initialHasGroups}
          initialGroupId={initialGroupId}
        />
      </div>
    </div>
  );
}

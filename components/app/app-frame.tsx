import * as React from "react";
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
export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <main className="flex flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col lg:max-w-3xl">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

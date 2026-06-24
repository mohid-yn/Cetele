"use client";

import * as React from "react";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { DemoControls } from "./demo-controls";
import { useMock } from "@/lib/mock/store";

/**
 * Responsive app shell (UI_PRACTICES §3). Mobile: a centred single column with
 * a bottom tab bar. Desktop (≥lg): a persistent left sidebar with a wider
 * content column. Same routes, re-housed. Plus the demo ribbon + floating Demo
 * Controls for stakeholder walkthroughs.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { state } = useMock();

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        {state.ui.showRibbon && (
          <div className="bg-accent-100 py-1 text-center text-xs font-medium text-accent-800">
            DEMO · mock data — nothing is saved to a server
          </div>
        )}
        <main className="flex flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col lg:max-w-3xl">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>

      <DemoControls />
    </div>
  );
}

"use client";

import * as React from "react";
import { BottomNav } from "./bottom-nav";
import { DemoControls } from "./demo-controls";
import { useMock } from "@/lib/mock/store";

/**
 * Mobile app column: a "DEMO" ribbon, a scrollable content area, the bottom
 * nav, and the floating Demo Controls used to drive a stakeholder walkthrough.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { state } = useMock();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col border-border bg-background sm:border-x">
      {state.ui.showRibbon && (
        <div className="bg-accent-100 py-1 text-center text-xs font-medium text-accent-800">
          DEMO · mock data — nothing is saved to a server
        </div>
      )}
      <main className="flex flex-1 flex-col">{children}</main>
      <BottomNav />
      <DemoControls />
    </div>
  );
}

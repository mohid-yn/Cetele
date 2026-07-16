"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dlog } from "@/lib/db-log";

/**
 * M5 — keeps the group hub's collective progress LIVE (CET-7 substrate, M4).
 *
 * Renders nothing. Subscribes to postgres_changes on `logs` (RLS delivers only
 * groups we belong to), narrows to the active group's task ids, and debounces a
 * `router.refresh()` so the server component re-reads the authoritative
 * collective totals + contributions — no client-side re-derivation to drift.
 */
export function GroupLive({
  groupId,
  taskIds,
}: {
  groupId: string;
  taskIds: string[];
}) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const taskKey = taskIds.join(",");

  React.useEffect(() => {
    const taskSet = new Set(taskKey ? taskKey.split(",") : []);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        dlog("realtime.group → router.refresh()");
        router.refresh();
      }, 500);
    };

    const channel = supabase
      .channel(`live-group-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "logs" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { task_id?: string };
          if (row?.task_id && taskSet.has(row.task_id)) {
            dlog("realtime.group ← logs change", row.task_id);
            refreshSoon();
          }
        },
      );

    // `cancelled` guards the async gap: a subscribe landing after cleanup would
    // re-open a channel removeChannel already tore down (see today-live.tsx).
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => dlog("realtime.group status", status));
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [groupId, taskKey, router, supabase]);

  return null;
}

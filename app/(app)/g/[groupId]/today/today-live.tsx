"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dlog } from "@/lib/db-log";

/**
 * M4 — makes the /today collective counter + circle standings LIVE (CET-7).
 *
 * Renders nothing. Subscribes to postgres_changes on `logs` (added to the
 * `supabase_realtime` publication in migration 0009); RLS means we only receive
 * changes for groups we belong to. We narrow to the ACTIVE group's task ids,
 * then debounce a `router.refresh()` so the server component re-reads the
 * authoritative collective sum + circle — no client-side re-derivation to drift.
 *
 * Debounced because taps reach the DB as ~1 UPDATE per client flush (600ms
 * debounce on the tap pad), and a burst from several members should coalesce
 * into a single refresh rather than a refresh per row.
 */
export function TodayLive({
  groupId,
  taskIds,
}: {
  groupId: string;
  taskIds: string[];
}) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  // Stable primitive dep so the effect doesn't re-subscribe on array identity.
  const taskKey = taskIds.join(",");

  React.useEffect(() => {
    const taskSet = new Set(taskKey ? taskKey.split(",") : []);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        dlog("realtime.today → router.refresh()");
        router.refresh();
      }, 500);
    };

    const channel = supabase
      .channel(`live-logs-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "logs" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { task_id?: string };
          if (row?.task_id && taskSet.has(row.task_id)) {
            dlog("realtime.today ← logs change", row.task_id);
            refreshSoon();
          }
        },
      );

    // Carry the auth token so realtime applies our RLS (only our groups' logs).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => dlog("realtime.today status", status));
    });

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [groupId, taskKey, router, supabase]);

  return null;
}

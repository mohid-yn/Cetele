"use client";

/**
 * Group switcher (real, M5 follow-up) — the Slack/Notion workspace-switcher
 * pattern, wired to the real active-group cookie. Fetches the circles the
 * signed-in user belongs to (RLS-scoped), shows the active one, and switches
 * via the `setActiveGroup` Server Action (validates visibility, moves the
 * cookie, redirects back to the current screen) — so a member of several
 * circles can move between them and every server screen re-reads that group.
 *
 * Self-fetching so it can live in the (still-mock) app shell without threading
 * server data through it; `initialName` avoids a flash where the caller (the
 * server-first /group hub) already knows the active group's name.
 */

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { setActiveGroup } from "@/app/(app)/groups/actions";
import { ChevronDownIcon, CheckIcon, GridIcon } from "@/components/demo/icons";

type Role = "owner" | "admin" | "member";
type Group = { id: string; name: string; role: Role };

const ROLE_RANK: Record<Role, number> = { owner: 0, admin: 1, member: 2 };

/** Read a non-httpOnly cookie in the browser. */
function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(name + "="))
    ?.split("=")[1];
}

export function GroupSwitcher({
  className,
  initialName,
}: {
  className?: string;
  initialName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: claims } = await supabase.auth.getClaims();
      const me = claims?.claims.sub;
      if (!me) return;
      const { data } = await supabase
        .from("memberships")
        .select("role, groups(id, name)")
        .eq("user_id", me);
      const list: Group[] = (data ?? [])
        .filter((r) => r.groups)
        .map((r) => ({
          id: r.groups!.id,
          name: r.groups!.name,
          role: r.role as Role,
        }));
      if (cancelled) return;
      // Mirror resolveActiveGroup: cookie if it's one of mine, else best role.
      const cookie = readCookie("cetele-active-group");
      const best = [...list].sort(
        (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role],
      )[0];
      const active =
        cookie && list.some((g) => g.id === cookie)
          ? cookie
          : (best?.id ?? null);
      setGroups(list);
      setActiveId(active);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeName =
    groups.find((g) => g.id === activeId)?.name ??
    initialName ??
    "Select group";

  function switchTo(id: string) {
    setOpen(false);
    if (id === activeId) return;
    // The sidebar switcher stays mounted across the soft navigation, so update
    // the label/checkmark now rather than waiting for a remount.
    setActiveId(id);
    startTransition(async () => {
      await setActiveGroup(id, pathname);
    });
  }

  const roleLabel = (r: Role) =>
    r === "owner" ? "Owner" : r === "admin" ? "Co-admin" : "Member";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg text-foreground transition-colors hover:bg-muted disabled:opacity-60",
          className,
        )}
      >
        <span className="truncate">{activeName}</span>
        <ChevronDownIcon className="size-[0.7em] shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-[var(--z-dropdown)] mt-1 min-w-[14rem] rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          <p className="px-2.5 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Switch group
          </p>
          {groups.map((g) => {
            const activeOne = g.id === activeId;
            return (
              <button
                key={g.id}
                type="button"
                role="option"
                aria-selected={activeOne}
                onClick={() => switchTo(g.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="grid size-4 shrink-0 place-items-center">
                  {activeOne && <CheckIcon className="size-4 text-primary" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {g.name}
                </span>
                <Badge
                  variant={
                    g.role === "member"
                      ? "neutral"
                      : g.role === "owner"
                        ? "accent"
                        : "primary"
                  }
                  size="sm"
                >
                  {roleLabel(g.role)}
                </Badge>
              </button>
            );
          })}
          {groups.length === 0 && (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">
              No groups yet.
            </p>
          )}

          {/* Drive-style "My Drive" entry — manage / create groups */}
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/groups");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-muted"
            >
              <GridIcon className="size-4" />
              All my groups
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

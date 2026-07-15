"use client";

/**
 * Group switcher (CET-25) — the Slack/Notion workspace-switcher pattern, now
 * path-based. Fetches the circles the signed-in user belongs to (RLS-scoped)
 * and renders each as a prefetched <Link> to `/g/[groupId]/<currentTab>`, so
 * hovering preloads that group's screen and clicking switches instantly — no
 * Server Action round-trip, no cookie write on the client (the proxy records
 * last-visited from the path). Keeps the same tab across the switch.
 *
 * Self-fetching so it can live in the (still-mock) app shell without threading
 * server data through it; `initialName` avoids a flash where the caller (the
 * server-first /group hub) already knows the active group's name.
 */

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/db-log";
import { ChevronDownIcon, CheckIcon, GridIcon } from "@/components/app/icons";
import { groupHref, groupIdFromPath, groupSubPath } from "@/lib/group-href";
import { writeActiveGroupCookie } from "@/components/app/remember-active-group";

type Role = "owner" | "admin" | "member";
type Group = { id: string; name: string; role: Role };

const ROLE_RANK: Record<Role, number> = { owner: 0, admin: 1, member: 2 };

export function GroupSwitcher({
  className,
  initialName,
}: {
  className?: string;
  initialName?: string;
}) {
  const pathname = usePathname();
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [open, setOpen] = React.useState(false);
  // Where to anchor the portaled menu (fixed, viewport coords). The menu is
  // portaled to <body> so nothing in the page can paint over it (D46's page-
  // transition transform + the segmented control's layoutId element were
  // stacking above an in-flow dropdown, jumbling the UI).
  const [coords, setCoords] = React.useState<{
    top: number;
    left: number;
  } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left });
    setOpen(true);
  };

  // The active group + the tab to preserve both come from the URL.
  const activeId = groupIdFromPath(pathname);
  const sub = groupSubPath(pathname);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: claims } = await supabase.auth.getClaims();
      const me = claims?.claims.sub;
      if (!me) return;
      const { data } = await q(
        "switcher.memberships",
        supabase
          .from("memberships")
          .select("role, groups(id, name)")
          .eq("user_id", me),
      );
      const list: Group[] = (data ?? [])
        .filter((r) => r.groups)
        .map((r) => ({
          id: r.groups!.id,
          name: r.groups!.name,
          role: r.role as Role,
        }))
        .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role]);
      if (cancelled) return;
      setGroups(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      // The menu is portaled outside the button's wrapper, so check both.
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // A fixed-position menu doesn't follow the page — close it on scroll/resize
    // rather than let it drift away from the button.
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const activeName =
    groups.find((g) => g.id === activeId)?.name ??
    initialName ??
    "Select group";

  const roleLabel = (r: Role) =>
    r === "owner" ? "Owner" : r === "admin" ? "Co-admin" : "Member";

  const menu = open && coords && typeof document !== "undefined" && (
    <div
      ref={menuRef}
      role="listbox"
      style={{ position: "fixed", top: coords.top, left: coords.left }}
      className="z-[var(--z-modal)] min-w-[14rem] rounded-xl border border-border bg-card p-1 shadow-lg"
    >
      <p className="px-2.5 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Switch group
      </p>
      {groups.map((g) => {
        const activeOne = g.id === activeId;
        return (
          <Link
            key={g.id}
            href={groupHref(g.id, sub)}
            role="option"
            aria-selected={activeOne}
            onClick={() => {
              // Record the choice immediately (not just when the target page
              // mounts), so a switch → Profile jump can't briefly resolve to the
              // old circle.
              writeActiveGroupCookie(g.id);
              setOpen(false);
            }}
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
          </Link>
        );
      })}
      {groups.length === 0 && (
        <p className="px-2.5 py-2 text-sm text-muted-foreground">
          No groups yet.
        </p>
      )}

      {/* Drive-style "My Drive" entry — manage / create groups */}
      <div className="mt-1 border-t border-border pt-1">
        <Link
          href="/groups"
          onClick={() => setOpen(false)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-muted"
        >
          <GridIcon className="size-4" />
          All my groups
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg text-foreground transition-colors hover:bg-muted",
          className,
        )}
      >
        <span className="truncate">{activeName}</span>
        <ChevronDownIcon className="size-[0.7em] shrink-0 opacity-60" />
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  );
}

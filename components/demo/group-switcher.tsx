"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { ChevronDownIcon, CheckIcon, GridIcon } from "./icons";
import type { MemberRole } from "@/lib/mock/types";

/**
 * Group switcher (the Slack/Notion workspace-switcher pattern). The active group
 * name is a dropdown of every group the user belongs to — each with its role
 * (owner / co-admin / member) — plus a link to the Groups home (Drive's "My
 * Drive"). Under the D26 ownership model a user only ever sees their own
 * groups, so there is no special app-admin "see everything" branch.
 */
export function GroupSwitcher({ className }: { className?: string }) {
  const { state, actions } = useMock();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const me = state.session.currentUserId;
  const active = sel.activeGroup(state);

  const memberships = sel.userGroups(state, me);
  const roleFor = (gid: string): MemberRole | undefined =>
    memberships.find((m) => m.groupId === gid)?.role;

  const groups = memberships.map((m) => m.group).filter(Boolean);

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

  const roleLabel = (gid: string): string => {
    const r = roleFor(gid);
    if (r === "owner") return "Owner";
    if (r === "admin") return "Co-admin";
    if (r === "member") return "Member";
    return "";
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg text-foreground transition-colors hover:bg-muted",
          className,
        )}
      >
        <span className="truncate">{active.name}</span>
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
            const activeOne = g.id === active.id;
            const label = roleLabel(g.id);
            return (
              <button
                key={g.id}
                type="button"
                role="option"
                aria-selected={activeOne}
                onClick={() => {
                  actions.setActiveGroup(g.id);
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
                {label && (
                  <Badge
                    variant={
                      label === "Member"
                        ? "neutral"
                        : label === "Owner"
                          ? "accent"
                          : "primary"
                    }
                    size="sm"
                  >
                    {label}
                  </Badge>
                )}
              </button>
            );
          })}

          {/* Drive-style "My Drive" entry — manage / create groups */}
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => {
                router.push("/groups");
                setOpen(false);
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

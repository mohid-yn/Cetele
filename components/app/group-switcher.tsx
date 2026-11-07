"use client";

/**
 * Group switcher (CET-25) — the Slack/Notion workspace-switcher pattern, now
 * path-based. Renders each circle as a prefetched <Link> to
 * `/g/[groupId]/<currentTab>`, so hovering preloads that group's screen and
 * clicking switches instantly — no Server Action round-trip, no cookie write on
 * the client (the proxy records last-visited from the path). Keeps the same tab
 * across the switch.
 *
 * The circle list comes from the shared groups store (`lib/groups-store`),
 * refreshed on every navigation — NOT a private fetch-on-mount: the app shell
 * survives client-side navigation, so a one-shot fetch went stale the moment
 * you created/joined/left a circle (a second group never appeared in the menu,
 * and the trigger fell back to "Select group" because the stale list couldn't
 * name the active circle). `initialName` still avoids a flash where the caller
 * (the server-first /group hub) already knows the active group's name.
 */

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Avatar } from "@/components/ui";
import { DURATION, EASE_BRAND } from "@/lib/motion";
import {
  BranchesIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  GridIcon,
} from "@/components/app/icons";
import { useBranchesIRun, useIsSuperAdmin } from "@/lib/viewer-store";
import { groupHref, groupSubPath } from "@/lib/group-href";
import { useActiveGroupId } from "@/lib/use-active-group";
import { refreshGroups, useGroupsSnapshot } from "@/lib/groups-store";
import { writeActiveGroupCookie } from "@/components/app/remember-active-group";

type Role = "owner" | "admin" | "member";

export function GroupSwitcher({
  className,
  initialName,
  initialGroupId = null,
  onlyWhenMultiple = false,
}: {
  className?: string;
  initialName?: string;
  initialGroupId?: string | null;
  /**
   * Render NOTHING for someone with a single circle. Off by default because on
   * /group the switcher IS the page title and must always be there — but on
   * Today it is a convenience, and a switcher with nothing to switch to is a
   * control that does not work. Waits for the store to load rather than
   * guessing: showing it and then taking it away is worse than a late arrival.
   */
  onlyWhenMultiple?: boolean;
}) {
  const pathname = usePathname();
  const { groups, loaded } = useGroupsSnapshot();
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

  // The active group is the one in the URL, or — on group-independent screens
  // like /profile and /groups — the last-visited one (cookie). Resolving it
  // URL-only left the switcher showing "Select group" on Profile even though a
  // circle was active. The tab to preserve still comes from the URL.
  const activeId = useActiveGroupId(initialGroupId);
  const sub = groupSubPath(pathname);

  // Re-fetch on every navigation (create → manage, join → today, leave →
  // /groups all navigate), so the menu is never stale. The store coalesces
  // concurrent callers, so overlapping with useHasGroups costs nothing extra.
  React.useEffect(() => {
    void refreshGroups();
  }, [pathname]);

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

  // The places this person RUNS (D86): the branches they are an admin of, or
  // every branch for an organiser. Listed under their circles, so the control
  // that moves between circles is also the way into running a place: one
  // switcher for every space they belong to (Discord's server list, Slack's
  // workspace menu), not a tab that comes and goes or a row hidden in Profile.
  const runs = useBranchesIRun();
  const isOrganiser = useIsSuperAdmin();
  const runsAnything = isOrganiser || runs.length > 0;

  // One circle and nothing to run: nothing to switch between.
  const hidden =
    onlyWhenMultiple && (!loaded || (groups.length <= 1 && !runsAnything));

  const roleLabel = (r: Role) =>
    r === "owner" ? "Owner" : r === "admin" ? "Admin" : "Member";

  const menu = open && coords && typeof document !== "undefined" && (
    <motion.div
      ref={menuRef}
      role="listbox"
      // From the control it came out of, quick and small. Used a few times a
      // week at most, so it can afford to move, but never to make anyone wait.
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE_BRAND }}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        transformOrigin: "top left",
      }}
      className="z-[var(--z-modal)] w-72 max-w-[calc(100vw-2.5rem)] rounded-xl border border-border bg-elevated p-1.5 shadow-lg"
    >
      {runsAnything && <MenuHeading>Your circles</MenuHeading>}
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
            className={cn(
              "flex min-h-14 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
              activeOne
                ? "bg-primary-container text-on-primary-container"
                : "text-foreground hover:bg-surface-hover active:bg-surface-active",
            )}
          >
            {/* The current row is already sage, so its initial sits on the card
                colour rather than disappearing into the same fill. */}
            <Avatar
              name={g.name}
              size="sm"
              className={activeOne ? "bg-card text-foreground" : undefined}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {g.name}
              </span>
              <span
                className={cn(
                  "block text-xs",
                  activeOne
                    ? "text-on-primary-container"
                    : "text-muted-foreground",
                )}
              >
                {roleLabel(g.role)}
                {/* Where the circle is (D79), so two circles with one name in
                    different places can be told apart. */}
                {g.branchName && ` · ${g.branchName}`}
              </span>
            </span>
            {activeOne && <CheckIcon aria-hidden className="size-5 shrink-0" />}
          </Link>
        );
      })}
      {groups.length === 0 && (
        <p className="px-2.5 py-2 text-sm text-muted-foreground">
          No groups yet.
        </p>
      )}

      {runsAnything && (
        <div className="mt-1.5 border-t border-border pt-1.5">
          <MenuHeading>You run</MenuHeading>
          {isOrganiser ? (
            <PlaceLink
              href="/admin/branches"
              name="All branches"
              onPick={() => setOpen(false)}
            />
          ) : (
            runs.map((b) => (
              <PlaceLink
                key={b.id}
                href={`/admin/branches/${b.id}`}
                name={b.name}
                onPick={() => setOpen(false)}
              />
            ))
          )}
        </div>
      )}

      {/* Drive-style "My Drive" entry — manage / create groups */}
      <div className="mt-1.5 border-t border-border pt-1.5">
        <Link
          href="/groups"
          onClick={() => setOpen(false)}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-hover active:bg-surface-active"
        >
          <span className="grid size-8 shrink-0 place-items-center text-primary">
            <GridIcon aria-hidden className="size-5" />
          </span>
          All my groups
        </Link>
      </div>
    </motion.div>
  );

  if (hidden) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={cn(
          // max-w-full + min-w-0 are what let the inner `truncate` engage: without
          // them the button grows past the header's title column and a long circle
          // name runs underneath the header actions.
          // min-h-11 = 44px tap target; the text-2xl title only stood 36px tall.
          // A dropdown has to look like one before anyone touches it: a filled sage
          // pill and a solid chevron. Text with a faded caret read as a label.
          "tap-area-44 inline-flex min-h-9 max-w-full min-w-0 items-center gap-1 rounded-full bg-primary-container pr-2.5 pl-3.5 text-on-primary-container transition-colors hover:bg-primary-container-hover active:bg-primary-container-active",
          className,
        )}
      >
        <span className="truncate">{activeName}</span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-brand)]",
            open && "rotate-180",
          )}
        />
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  );
}

function MenuHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/** A place this person runs: opens it in the administration workspace. */
function PlaceLink({
  href,
  name,
  onPick,
}: {
  href: string;
  name: string;
  onPick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onPick}
      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-foreground transition-colors hover:bg-surface-hover active:bg-surface-active"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-100 text-primary-800">
        <BranchesIcon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {name}
      </span>
      <ChevronRightIcon
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

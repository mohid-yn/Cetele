"use client";

import * as React from "react";
import Link from "next/link";
import { Screen, buttonVariants } from "@/components/ui";
import { ArrowLeftIcon, EyeIcon, UsersIcon } from "@/components/app/icons";
import { Segmented } from "@/components/app/segmented";
import { programmeReach, programmeReadiness } from "@/lib/programme-readiness";
import {
  CATEGORY_LABEL,
  levelsOf,
  type LevelRequirement,
  type RoadmapItem,
} from "@/lib/roadmap";
import type { BuilderTab } from "./builder-tabs";
import { CirclesPanel, type RoadmapCircle } from "./circles-panel";
import { ItemsPanel } from "./items-panel";
import { ReachCard } from "./reach-card";
import { RewardsEditor, type EditableReward } from "./rewards-editor";
import { SettingsPanel } from "./settings-panel";

// A fixed locale: this renders on the server and the client, and the browser's
// default would make the two disagree.
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * An organiser's screen for one roadmap (D72). It leads with who can see it,
 * then splits the four jobs into tabs. They used to share one long scroll, with
 * the items below the controls and rewards, so the most frequent job was the
 * furthest away.
 *
 * Tabs switch instantly: this is a tool used repeatedly, and the sliding
 * highlight already shows where you went. The tab is kept in the URL so a reload
 * or a shared link lands in the same place.
 */
export function ProgrammeBuilder({
  roadmap,
  items,
  requirements,
  rewards,
  circles,
  recordedIds,
  sortOrders,
  canReadCohort,
  todayISO,
  initialTab,
}: {
  roadmap: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    published: boolean;
  };
  items: RoadmapItem[];
  requirements: LevelRequirement[];
  rewards: EditableReward[];
  circles: RoadmapCircle[];
  recordedIds: string[];
  sortOrders: [string, number][];
  canReadCohort: boolean;
  todayISO: string;
  initialTab: BuilderTab;
}) {
  const [tab, setTab] = React.useState<BuilderTab>(initialTab);
  const recorded = React.useMemo(() => new Set(recordedIds), [recordedIds]);
  const sortMap = React.useMemo(() => new Map(sortOrders), [sortOrders]);

  const choose = (next: BuilderTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  const following = circles.filter((c) => c.following);
  const reach = programmeReach(roadmap.published, following);
  const readiness = programmeReadiness({
    items: items.map((i) => ({
      level: i.level,
      category: i.category,
      categoryLabel: CATEGORY_LABEL[i.category],
      unit: i.unit,
      target: i.target,
    })),
    requirements,
    rewards,
    endsOn: roadmap.endsOn,
    todayISO,
    circles: following.length,
  });

  return (
    <Screen>
      <Link
        href="/programme"
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start px-2 py-2 text-sm font-medium text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden className="size-4" /> Roadmaps
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold wrap-anywhere text-foreground">
          {roadmap.name}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
          {fmtDate(roadmap.startsOn)} to {fmtDate(roadmap.endsOn)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {canReadCohort && following.length > 0 && (
            <Link
              href={`/programme/${roadmap.id}/progress`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <UsersIcon aria-hidden />
              Members&rsquo; progress
            </Link>
          )}
          <Link
            href={`/programme/${roadmap.id}?view=member`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <EyeIcon aria-hidden />
            Preview
          </Link>
        </div>
      </div>

      <ReachCard
        roadmapId={roadmap.id}
        name={roadmap.name}
        published={roadmap.published}
        reach={reach}
        readiness={readiness}
        onAddCircles={() => choose("circles")}
      />

      <Segmented<BuilderTab>
        value={tab}
        onChange={choose}
        options={[
          { value: "items", label: "Items" },
          { value: "circles", label: "Circles" },
          { value: "rewards", label: "Rewards" },
          { value: "settings", label: "Settings" },
        ]}
      />

      {tab === "items" && (
        <ItemsPanel
          roadmapId={roadmap.id}
          items={items}
          requirements={requirements}
          recordedIds={recorded}
          sortOrders={sortMap}
          anyRecorded={recorded.size > 0}
        />
      )}
      {tab === "circles" && (
        <CirclesPanel
          roadmapId={roadmap.id}
          published={roadmap.published}
          circles={circles}
        />
      )}
      {tab === "rewards" && (
        <RewardsEditor
          roadmapId={roadmap.id}
          rewards={rewards}
          recorded={recorded.size > 0}
          levelCount={levelsOf(items).length}
        />
      )}
      {tab === "settings" && (
        <SettingsPanel
          roadmapId={roadmap.id}
          name={roadmap.name}
          startsOn={roadmap.startsOn}
          endsOn={roadmap.endsOn}
          recorded={recorded.size > 0}
        />
      )}
    </Screen>
  );
}

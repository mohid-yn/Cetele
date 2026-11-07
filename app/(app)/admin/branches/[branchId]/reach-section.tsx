import Link from "next/link";
import { Badge, buttonVariants, Card } from "@/components/ui";
import { SectionHeading } from "@/components/app/section-heading";
import {
  CalendarIcon,
  ChevronRightIcon,
  FlagIcon,
  PlusIcon,
  UsersIcon,
} from "@/components/app/icons";
import { clock, formatWhen, WEEKDAY_NAMES } from "@/lib/events";
import { AssignRoadmap } from "./assign-roadmap";

export type ReachItem = {
  kind: "roadmap" | "series" | "camp";
  id: string;
  title: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  weekday: number | null;
  startTime: string | null;
  fromBranchName: string;
  inherited: boolean;
};

/**
 * WHAT REACHES CIRCLES HERE (D82): the branch page as the hub.
 *
 * The owner could not tell how roadmaps and events reach people. This answers
 * it for one place, in one block: every roadmap, weekly halaqah and upcoming
 * camp that reaches this branch's circles, each marked "Set here" or "From
 * <branch above>", with the buttons to add one right here.
 */
export function ReachSection({
  branchId,
  branchName,
  circles,
  items,
  isOrganiser,
  roadmaps,
}: {
  branchId: string;
  branchName: string;
  /** Circles in this branch and every branch inside it. */
  circles: number;
  items: ReachItem[];
  isOrganiser: boolean;
  /** Every roadmap, for the organiser's assign dialog. */
  roadmaps: { id: string; name: string; published: boolean; here: boolean }[];
}) {
  const roadmapItems = items.filter((i) => i.kind === "roadmap");
  const series = items.filter((i) => i.kind === "series");
  const camps = items
    .filter((i) => i.kind === "camp")
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));

  return (
    <section>
      <SectionHeading>What reaches circles here</SectionHeading>
      <p className="mb-3 flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-foreground">
        <UsersIcon
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <span>
          Anything set on <strong>{branchName}</strong> or a branch above it
          reaches all{" "}
          <strong className="tabular-nums">
            {circles} {circles === 1 ? "circle" : "circles"}
          </strong>{" "}
          in {branchName} and the branches inside it.
        </span>
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <Link
          href={`/admin/events/new?branch=${branchId}`}
          className={buttonVariants({ variant: "accent", size: "sm" })}
        >
          <PlusIcon aria-hidden className="size-4" /> Camp here
        </Link>
        <Link
          href={`/admin/events/series/new?branch=${branchId}`}
          className={buttonVariants({ variant: "tonal", size: "sm" })}
        >
          <PlusIcon aria-hidden className="size-4" /> Weekly halaqah here
        </Link>
        {isOrganiser && (
          <AssignRoadmap
            branchId={branchId}
            branchName={branchName}
            circles={circles}
            roadmaps={roadmaps}
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <Group
          title="Roadmaps"
          Icon={FlagIcon}
          empty={
            isOrganiser
              ? "None. Assign one above, or add single circles from the roadmap."
              : "None set on this branch or above it."
          }
        >
          {roadmapItems.map((r) => (
            <Row
              key={`${r.id}-${r.fromBranchName}`}
              href={isOrganiser ? `/programme/${r.id}?tab=circles` : null}
              title={r.title}
              meta={r.status === "draft" ? "Draft, not visible yet" : null}
              item={r}
            />
          ))}
        </Group>
        <Group
          title="Weekly halaqahs"
          Icon={CalendarIcon}
          empty="None set on this branch or above it."
        >
          {series.map((s) => {
            const [h, m] = (s.startTime ?? "0:0").split(":").map(Number);
            return (
              <Row
                key={s.id}
                href={s.inherited ? null : `/admin/events/series/${s.id}`}
                title={s.title}
                meta={`${WEEKDAY_NAMES[s.weekday ?? 0]}s at ${clock(h, m)}${s.status === "off" ? " · off" : ""}`}
                item={s}
              />
            );
          })}
        </Group>
        <Group
          title="Upcoming camps"
          Icon={CalendarIcon}
          empty="No camps coming up for this branch."
        >
          {camps.map((c) => (
            <Row
              key={c.id}
              href={c.inherited ? `/events/${c.id}` : `/admin/events/${c.id}`}
              title={c.title}
              meta={
                formatWhen(c.startsAt!, c.endsAt!, c.timezone ?? "UTC") +
                (c.status === "draft"
                  ? " · draft"
                  : c.status === "cancelled"
                    ? " · cancelled"
                    : "")
              }
              item={c}
            />
          ))}
        </Group>
      </Card>
    </section>
  );
}

function Group({
  title,
  Icon,
  empty,
  children,
}: {
  title: string;
  Icon: typeof FlagIcon;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <p className="flex items-center gap-2 px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon aria-hidden className="size-4" /> {title}
      </p>
      {children.length > 0 ? (
        <ul className="flex flex-col">{children}</ul>
      ) : (
        <p className="px-4 pb-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Row({
  href,
  title,
  meta,
  item,
}: {
  href: string | null;
  title: string;
  meta: string | null;
  item: ReachItem;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {title}
        </span>
        {meta && (
          <span className="block text-xs text-muted-foreground">{meta}</span>
        )}
      </span>
      {item.inherited ? (
        <Badge variant="neutral" size="sm">
          From {item.fromBranchName}
        </Badge>
      ) : (
        <Badge variant="primary" size="sm">
          Set here
        </Badge>
      )}
      {href && (
        <ChevronRightIcon
          aria-hidden
          className="size-5 shrink-0 text-muted-foreground"
        />
      )}
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface-hover"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-h-12 items-center gap-3 px-4 py-2">{body}</div>
      )}
    </li>
  );
}

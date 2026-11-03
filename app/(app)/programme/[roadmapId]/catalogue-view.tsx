import { Badge, Card } from "@/components/ui";
import { SectionHeading } from "@/components/app/section-heading";
import { BookIcon, ExternalLinkIcon, PlayIcon } from "@/components/app/icons";
import { RewardLadder } from "@/components/app/roadmap-rewards";
import { RoadmapCover } from "@/components/app/roadmap-cover";
import {
  CATEGORY_LABEL,
  categoriesAt,
  itemsIn,
  isSafeItemUrl,
  levelsOf,
  requirementFor,
  type LevelRequirement,
  type RoadmapItem,
} from "@/lib/roadmap";

/**
 * What a roadmap asks for, read-only. Every count is the item's target, never
 * anyone's progress: the member's own screen is where progress is recorded.
 * Shown to members of a following circle, and to an organiser previewing.
 */
export function CatalogueView({
  items,
  requirements,
  rewards,
}: {
  items: RoadmapItem[];
  requirements: LevelRequirement[];
  rewards: {
    id: string;
    threshold: number;
    label: string;
    description: string | null;
  }[];
}) {
  const levels = levelsOf(items);

  return (
    <>
      {rewards.length > 0 && (
        <section>
          <SectionHeading>Rewards</SectionHeading>
          <Card padding="md">
            {/* levelsDone={0}: nobody's progress is on this screen, so every
                rung reads as still to earn. */}
            <RewardLadder
              rewards={rewards}
              levelsDone={0}
              totalLevels={levels.length}
            />
          </Card>
        </section>
      )}

      {levels.length === 0 ? (
        <Card padding="md">
          <p className="py-4 text-center text-sm text-muted-foreground">
            This roadmap has nothing on it yet.
          </p>
        </Card>
      ) : (
        levels.map((level) => (
          <section key={level}>
            <SectionHeading>Level {level}</SectionHeading>
            <div className="flex flex-col gap-3">
              {categoriesAt(items, level).map((category) => {
                const group = itemsIn(items, level, category);
                const req = requirementFor(requirements, level, category);
                return (
                  <Card key={category} padding="none">
                    <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {CATEGORY_LABEL[category]}
                      </h3>
                      <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {req
                          ? `choose ${req.minTotal} ${group[0]?.unit ?? ""}`
                          : `${group.length} to complete`}
                      </p>
                    </div>
                    <ul className="divide-y divide-border">
                      {group.map((i) => (
                        <li key={i.id} className="flex items-start gap-3 p-4">
                          <RoadmapCover
                            imageUrl={i.imageUrl}
                            className="w-12"
                            fallback={
                              <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container">
                                {i.category === "listening" ? (
                                  <PlayIcon aria-hidden className="size-4" />
                                ) : (
                                  <BookIcon aria-hidden className="size-4" />
                                )}
                              </div>
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium wrap-anywhere text-foreground">
                              <span>{i.title}</span>
                              {i.compulsory && (
                                <Badge variant="primary" size="sm">
                                  Required
                                </Badge>
                              )}
                            </p>
                            {i.source && (
                              <p className="text-xs wrap-anywhere text-muted-foreground">
                                {i.source}
                              </p>
                            )}
                            {i.description && (
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed wrap-anywhere text-muted-foreground">
                                {i.description}
                              </p>
                            )}
                            {isSafeItemUrl(i.url) && (
                              <a
                                href={i.url!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
                              >
                                Open link
                                <ExternalLinkIcon
                                  aria-hidden
                                  className="size-3"
                                />
                              </a>
                            )}
                          </div>
                          {i.target !== 1 && (
                            <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {i.target} {i.unit}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * An item's cover, with the category's icon behind it.
 *
 * THE POINT IS THE FALLBACK, and there are two ways to need it. A NULL
 * `image_url` is the ordinary one — most items have no artwork, and only the
 * ten books do. The other is a picture that does not load: `image_url` is
 * organiser-editable (D57) and the RPC checks the SCHEME, not that anything is
 * actually there, so a typo, a moved file or a host that later 404s all end in
 * the same place. Without `onError` that is a broken-image box on every
 * member's roadmap until someone notices and fixes the row.
 *
 * A client component, and that is why this exists as a component at all: the
 * catalogue at `/programme/[roadmapId]` is a SERVER component and cannot hold
 * the "this one failed" state. Both screens render covers, so both get the same
 * behaviour from here rather than one of them quietly lacking it.
 *
 * A plain <img>, not next/image: the URL may point at any host, and
 * `remotePatterns` cannot be maintained for "wherever an organiser pasted
 * from" — an unconfigured host makes next/image THROW, turning one bad paste
 * into a 500 on every member's roadmap rather than one missing picture.
 */
export function RoadmapCover({
  imageUrl,
  fallback,
  className,
}: {
  imageUrl: string | null;
  /** Drawn when there is no picture, or when it fails to load. */
  fallback: React.ReactNode;
  /** The frame around the image — callers size it. */
  className?: string;
}) {
  // The failure is stored AS the url that failed, not as a boolean, so a new
  // url is un-failed by definition — an organiser fixing a broken link must not
  // be stuck behind a flag left by the previous value. Deriving it during render
  // is also why there is no effect here: resetting state from one would be
  // `react-hooks/set-state-in-effect`, and this needs no synchronisation.
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);

  if (!imageUrl || failedUrl === imageUrl) return <>{fallback}</>;

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-lg border border-border bg-muted shadow-sm",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- see the note above: an organiser-editable host cannot be declared in remotePatterns */}
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(imageUrl)}
        className="block aspect-[2/3] w-full object-cover"
      />
    </div>
  );
}

import { redirect } from "next/navigation";

/**
 * Leaderboard was folded into Group → "Standings" (competition shouldn't be a
 * primary destination in a calm worship app). This route now redirects there so
 * any existing links/bookmarks still land somewhere sensible.
 */
export default function LeaderboardRedirect() {
  redirect("/group");
}

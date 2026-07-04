/**
 * Date plumbing for the per-user day boundary (D34: a member's day closes at
 * their OWN midnight, `profiles.timezone`). Server and client both format
 * with an explicit IANA zone so "today" always means the user's today.
 */

/** YYYY-MM-DD in the given IANA timezone (en-CA locale formats ISO-style). */
export function localDateISO(timeZone: string, d: Date = new Date()): string {
  try {
    return d.toLocaleDateString("en-CA", { timeZone });
  } catch {
    return d.toLocaleDateString("en-CA", { timeZone: "UTC" });
  }
}

/** The ISO date `daysAgo` days before the given ISO date (calendar math, tz-free). */
export function isoDaysAgo(iso: string, daysAgo: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - daysAgo));
  return t.toISOString().slice(0, 10);
}

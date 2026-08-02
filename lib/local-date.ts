/**
 * Date plumbing for the per-user day boundary (D34: a member's day closes at
 * their OWN midnight, `profiles.timezone`). Server and client both format
 * with an explicit IANA zone so "today" always means the user's today.
 */

/**
 * Formatters, cached per zone.
 *
 * `toLocaleDateString` builds a fresh `Intl.DateTimeFormat` on every call, and
 * constructing one is the expensive part by an order of magnitude. That was
 * fine while this was called once or twice per render; the as-of predicates
 * (0023/0024) call it per task, per day, per member — the group breakdown alone
 * is in the thousands. Bounded by the number of distinct timezones in a circle,
 * so it cannot grow.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    // en-CA formats ISO-style (YYYY-MM-DD).
    f = new Intl.DateTimeFormat("en-CA", { timeZone });
    formatters.set(timeZone, f);
  }
  return f;
}

/** YYYY-MM-DD in the given IANA timezone (en-CA locale formats ISO-style). */
export function localDateISO(timeZone: string, d: Date = new Date()): string {
  try {
    return formatter(timeZone).format(d);
  } catch {
    return formatter("UTC").format(d);
  }
}

/**
 * A DB timestamp (`timestamptz`, as PostgREST renders it) as a date on the
 * MEMBER's calendar — the client mirror of `private.user_date`.
 *
 * Never slice the string: PostgREST renders an offset, and slicing takes the
 * date in whatever zone that offset happens to be — which is the UTC reduction
 * this exists to replace. Every predicate that compares a stored timestamp
 * against a member's local day (`assignedOn`, `configOn`) must go through here.
 */
export function timestampDateISO(timeZone: string, ts: string): string {
  return localDateISO(timeZone, new Date(ts));
}

/** The ISO date `daysAgo` days before the given ISO date (calendar math, tz-free). */
export function isoDaysAgo(iso: string, daysAgo: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - daysAgo));
  return t.toISOString().slice(0, 10);
}

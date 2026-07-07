/**
 * Lightweight DB observability. Wrap a Supabase call (or a Promise.all batch of
 * them) with `q(label, promise)` to log its duration and surface any error —
 * so you can watch retrievals, spot lag (the Seoul round-trip), and see where
 * a query breaks. Works in Server Components/Actions (logs to the `pnpm dev`
 * terminal) and Client Components (browser console).
 *
 * On in development; silent in production unless DB_DEBUG=1 (server) or
 * NEXT_PUBLIC_DB_DEBUG=1 (client) is set.
 */

const ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.DB_DEBUG === "1" ||
  process.env.NEXT_PUBLIC_DB_DEBUG === "1";

const where = typeof window === "undefined" ? "server" : "client";

/** Pull `.error` messages out of a Supabase result — or an array of them. */
function errorsIn(res: unknown): string[] {
  const one = (r: unknown): string | null => {
    if (r && typeof r === "object" && "error" in r) {
      const e = (r as { error: unknown }).error;
      if (e)
        return typeof e === "object" && e && "message" in e
          ? String((e as { message: unknown }).message)
          : String(e);
    }
    return null;
  };
  const list = Array.isArray(res) ? res : [res];
  return list.map(one).filter((m): m is string => m != null);
}

/** Plain gated log — for non-promise events (realtime status, refreshes). */
export function dlog(label: string, ...args: unknown[]): void {
  if (!ENABLED) return;
  console.log(`[db:${where}] • ${label}`, ...args);
}

export async function q<T>(label: string, p: PromiseLike<T>): Promise<T> {
  if (!ENABLED) return p as Promise<T>;
  const t0 = performance.now();
  try {
    const res = await p;
    const ms = Math.round(performance.now() - t0);
    const errs = errorsIn(res);
    if (errs.length)
      console.warn(`[db:${where}] ✗ ${label} — ${ms}ms — ${errs.join(" | ")}`);
    else console.log(`[db:${where}] ✓ ${label} — ${ms}ms`);
    return res;
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    console.error(`[db:${where}] ✗ ${label} — ${ms}ms — threw:`, e);
    throw e;
  }
}

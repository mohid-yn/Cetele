/**
 * Roadmap saves that have not been confirmed yet, kept on the device.
 *
 * A save used to exist only in memory until the server answered, so a reload or a
 * closed app right after a tap lost it while the screen had already shown it as
 * done. Each one is written here at the moment of the tap and removed once the
 * server has answered, and whatever is left is sent again when the screen next
 * opens. Resending is safe because a save carries the item's whole count, not an
 * increment.
 *
 * Keyed per account, so a shared phone can never send one person's save as
 * another's. Entries expire, so a save stranded on an old device cannot overwrite
 * what the member has recorded elsewhere since. Storage can be missing or full,
 * in which case this does nothing and the write goes ahead as before.
 */
export type Outbox = Record<string, { done: number; at: number }>;

export const OUTBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The entries worth sending for these items, leaving out any that expired. */
export function pendingFor(
  outbox: Outbox,
  itemIds: ReadonlySet<string>,
  now: number,
): { id: string; done: number }[] {
  return Object.entries(outbox)
    .filter(
      ([id, entry]) => itemIds.has(id) && now - entry.at < OUTBOX_MAX_AGE_MS,
    )
    .map(([id, entry]) => ({ id, done: entry.done }));
}

/** The outbox without anything expired. */
export function withoutExpired(outbox: Outbox, now: number): Outbox {
  return Object.fromEntries(
    Object.entries(outbox).filter(
      ([, entry]) => now - entry.at < OUTBOX_MAX_AGE_MS,
    ),
  );
}

const keyFor = (userId: string) => `cetele-roadmap-outbox:${userId}`;

export function readOutbox(userId: string): Outbox {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    return raw ? (JSON.parse(raw) as Outbox) : {};
  } catch {
    return {};
  }
}

function writeOutbox(userId: string, outbox: Outbox): void {
  try {
    if (Object.keys(outbox).length === 0) {
      localStorage.removeItem(keyFor(userId));
    } else {
      localStorage.setItem(keyFor(userId), JSON.stringify(outbox));
    }
  } catch {
    // Private mode or a full disk. The write itself still goes out.
  }
}

export function rememberSave(
  userId: string,
  itemId: string,
  done: number,
): void {
  const outbox = readOutbox(userId);
  outbox[itemId] = { done, at: Date.now() };
  writeOutbox(userId, outbox);
}

/** Forget a save the server has answered, unless a newer tap has replaced it. */
export function forgetSave(userId: string, itemId: string, done: number): void {
  const outbox = readOutbox(userId);
  if (outbox[itemId]?.done !== done) return;
  delete outbox[itemId];
  writeOutbox(userId, outbox);
}

/** Clear out expired entries, and return what should be sent for these items. */
export function takePending(
  userId: string,
  itemIds: ReadonlySet<string>,
): { id: string; done: number }[] {
  const now = Date.now();
  const outbox = readOutbox(userId);
  writeOutbox(userId, withoutExpired(outbox, now));
  return pendingFor(outbox, itemIds, now);
}

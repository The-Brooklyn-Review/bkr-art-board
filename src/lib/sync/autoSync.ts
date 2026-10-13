// How stale the last sync may get before opening a page triggers a
// background sync. Shared by the server action and the pages.
export const AUTO_SYNC_AFTER_MS = 10 * 60 * 1000;

export function isSyncStale(last: Date | null, now = Date.now()): boolean {
  return !last || now - last.getTime() >= AUTO_SYNC_AFTER_MS;
}

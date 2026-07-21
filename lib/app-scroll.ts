/**
 * The app shell scrolls its CONTENT, not the document (see `AppFrame`), so the
 * bottom nav can never cover a screen's last element. One consequence: the
 * router's own scroll-to-top acts on the window and no longer reaches the right
 * element, so navigation has to reset this region itself (`app/(app)/template`,
 * which re-mounts on every route change).
 */
export const APP_SCROLL_ID = "app-scroll";

export function scrollAppToTop() {
  document.getElementById(APP_SCROLL_ID)?.scrollTo({ top: 0 });
}

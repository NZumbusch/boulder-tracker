/**
 * What the screen's scrolling tells the chrome around it: the top bar and the floating + slide away while a screen is
 * scrolled down through content and come back on scrolling up (`scrollHide.ts` decides), and the top bar shows an edge
 * once content has gone under it. Written by the app shell's scroll handler, read by `AppBar` and `Fab`.
 */
class ScrollChrome {
  /** Scrolled out of the way: down through content. */
  hidden = $state(false);
  /** Not at the top: content is under the bar. */
  scrolled = $state(false);
}

export const scrollChrome = new ScrollChrome();

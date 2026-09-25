/**
 * Back navigation: the phone's back key (Android) and the browser's back
 * button both close whatever is on top - a sheet, a modal, a settings
 * page - and from any tab but Home, go to Home.
 *
 * The app has no router: screens and overlays are plain state. So each
 * thing that "back" should undo registers itself here while it is open,
 * and gets one browser-history entry for it. Back pops that entry, which
 * fires `popstate`, which calls the top registration's `close`. Closing
 * something from its own UI (an X, a Cancel) releases its registration and
 * steps history back by one to match, so history never fills with dead
 * entries.
 *
 * Entries are counted, not identified: what must stay true is "history
 * has exactly as many entries above the base as there are registrations",
 * which holds even when a release's `history.back()` and a new
 * registration's `pushState` race each other.
 *
 * On Android, `@capacitor/app`'s back-button event is routed into the same
 * history (`installAndroidBack`); with nothing registered, back minimises
 * the app instead of closing it, so a running session survives.
 */
import { tick } from "svelte";

interface Entry {
  close: () => unknown;
  /** Still open after its close ran (e.g. "discard changes?" answered No) - then it re-arms. */
  alive: () => boolean;
}

const stack: Entry[] = [];
/** popstate events we caused ourselves (releases), to be ignored. */
let ignorePops = 0;
let installed = false;

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.history !== "undefined";
}

function pushEntry(entry: Entry) {
  stack.push(entry);
  window.history.pushState({ backDepth: stack.length }, "");
}

async function onPopState() {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  const entry = stack.pop();
  if (!entry) return;
  await entry.close();
  await tick();
  if (entry.alive()) pushEntry(entry);
}

function install() {
  if (installed || !hasWindow()) return;
  installed = true;
  window.addEventListener("popstate", () => void onPopState());
}

/** How many things back can still close. */
export function backDepth(): number {
  return stack.length;
}

/**
 * Registers something back should close. Returns its release: call it when
 * the thing closes by other means (it is a no-op once back has closed it).
 */
export function registerBack(close: () => unknown, alive: () => boolean = () => false): () => void {
  if (!hasWindow()) return () => {};
  install();
  const entry: Entry = { close, alive };
  pushEntry(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i === -1) return;
    stack.splice(i, 1);
    ignorePops++;
    window.history.back();
  };
}

/**
 * Component helper: while `active()` is true, back runs `close`. Call it
 * from a component's script. For an overlay that only exists while open,
 * `active` is simply `() => true` - unmounting releases it.
 *
 * `active` should read a stable boolean (a `$derived` flag, not an object):
 * the registration is renewed whenever what it reads changes.
 */
export function backWhile(active: () => boolean, close: () => unknown) {
  $effect(() => {
    if (!active()) return;
    let mounted = true;
    const release = registerBack(close, () => mounted && active());
    return () => {
      mounted = false;
      release();
    };
  });
}

/**
 * Android: routes the hardware back key into history. At the root (nothing
 * open, on Home) it minimises rather than exits, so the app - and a live
 * session - keep running in the background, as Android apps do.
 */
export async function installAndroidBack() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("backButton", () => {
    if (backDepth() > 0) window.history.back();
    else void App.minimizeApp();
  });
}

/** Test hook: forget everything (the module is a singleton). */
export function _resetBackStackForTests() {
  stack.length = 0;
  ignorePops = 0;
  installed = false;
}

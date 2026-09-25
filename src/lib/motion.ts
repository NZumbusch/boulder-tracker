/**
 * The app's motion setting, for animations driven from script.
 *
 * App.svelte resolves Settings -> Motion (System / Full / Reduced, System
 * following the OS) onto `<html data-motion="full|reduced">`, and app.css
 * shortens every CSS transition and animation under "reduced". Motion
 * started from script - the Web Animations API, Svelte's `animate:flip`,
 * svelte-dnd-action's settle animation, smooth `scrollIntoView` - never
 * sees that rule, so those call sites ask here instead of reading
 * `prefers-reduced-motion` themselves (which would ignore an explicit
 * in-app choice either way).
 */

export function motionReduced(): boolean {
  if (typeof document === "undefined") return false;
  const setting = document.documentElement.dataset.motion;
  if (setting) return setting === "reduced";
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** `ms`, or 0 when motion is reduced. */
export function motionMs(ms: number): number {
  return motionReduced() ? 0 : ms;
}

/** For `scrollIntoView`/`scrollTo`: smooth, or an instant jump when motion is reduced. */
export function scrollBehavior(): ScrollBehavior {
  return motionReduced() ? "auto" : "smooth";
}

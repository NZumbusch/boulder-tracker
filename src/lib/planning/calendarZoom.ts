/*
 * Zooming the calendar's time scale (Day and Week) by pinching, or by
 * ctrl + wheel on a laptop. Zoomed in far enough, a session shows its
 * exercises as blocks of their own under its title. Pure maths, so it can be
 * tested without a screen.
 */

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 4;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** The zoom after the two fingers moved from `startDistance` apart to `distance`, from the zoom the pinch began at. */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  if (!(startDistance > 0) || !Number.isFinite(distance)) return startZoom;
  return clampZoom(startZoom * (distance / startDistance));
}

/** The zoom after a ctrl + wheel tick (`deltaY` < 0 zooms in). */
export function wheelZoom(zoom: number, deltaY: number): number {
  return clampZoom(zoom * Math.exp(-deltaY * 0.01));
}

/**
 * The scroll position that keeps the time that was under the focus (`focusY`
 * px below the top of the hour grid) under it once an hour is `hourPxAfter`
 * tall instead of `hourPxBefore`.
 */
export function scrollAfterZoom(o: { scrollTop: number; focusY: number; hourPxBefore: number; hourPxAfter: number }): number {
  const hours = o.focusY / o.hourPxBefore;
  return Math.max(0, o.scrollTop + hours * (o.hourPxAfter - o.hourPxBefore));
}

/** A session this tall (px) shows its exercises as blocks, if it has more than one. */
export const EXERCISES_FROM_PX = 220;
export function showsExercises(heightPx: number, exerciseCount: number): boolean {
  return exerciseCount > 1 && heightPx >= EXERCISES_FROM_PX;
}

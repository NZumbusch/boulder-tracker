/**
 * The daily models: how the analytics screens get numbers that take real work to produce.
 *
 *   data in the stores  ->  models (immutable, one per snapshot)  ->  panels (slice a window)
 *
 * - A **model** (`ReadingsModel`, `ReadinessModel`) is built from a snapshot of the data and holds series that are worked
 *   out a day at a time and kept (`DaySeries`). A day's number never depends on the window on screen, so every window is
 *   a slice of the same series and nothing is recomputed to change period or range.
 * - Models are **never invalidated**: when the data or a setting changes the store (`AnalyticsStore`) builds new models
 *   and the old ones are dropped. There is no cache to go stale and no key to get wrong.
 * - A **warmer** (`startWarming`) fills the series in the background, in idle slices, newest days first, so charts are
 *   ready before they are opened. It is only an accelerator: a chart opened earlier computes what it needs itself.
 *
 * Add a new expensive per-day series by giving a model a `DaySeries` for it (and a line in its `warm`); never by caching
 * inside a pure function.
 */
export { DaySeries } from "./daySeries";
export { ReadingsModel } from "./readingsModel";
export { ReadinessModel, type ReadinessInputs } from "./readinessModel";
export { startWarming, idleScheduler, type Warmable, type WarmOptions } from "./warmer";

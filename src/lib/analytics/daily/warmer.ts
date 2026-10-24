/**
 * Fills the daily models' series in the background so the first time a chart is opened its numbers are already there.
 *
 * Not a worker: the models would have to be copied across and the results copied back, which costs about what it saves
 * on data this size. Instead the work is cut into slices of a few milliseconds that run when the browser is idle, newest
 * days first, and a slice yields as soon as there is something for the user to do. A chart opened before the warm-up has
 * reached it simply works out the days it needs itself - the warm-up only ever makes that unnecessary, it is never needed.
 */

export interface Warmable {
  /** Works out more of the series for about `budgetMs`. Returns true when there is nothing left to do. */
  warm(budgetMs: number): boolean;
}

/** Runs `callback` when the browser has a quiet moment; returns how to cancel it. */
export type IdleScheduler = (callback: () => void) => () => void;

export const idleScheduler: IdleScheduler = (callback) => {
  const g = globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
  if (typeof g.requestIdleCallback === "function") {
    // `timeout`: on a phone that never goes quiet, still make progress.
    const handle = g.requestIdleCallback(callback, { timeout: 400 });
    return () => g.cancelIdleCallback?.(handle);
  }
  const handle = setTimeout(callback, 40);
  return () => clearTimeout(handle);
};

export interface WarmOptions {
  /** How long one slice may run. */
  sliceMs?: number;
  /** Wait this long before starting, so loading and the first screen are not competing with it. */
  startDelayMs?: number;
  scheduler?: IdleScheduler;
  /** For tests: how to wait for the start delay. */
  delay?: (ms: number, callback: () => void) => () => void;
}

const timeoutDelay = (ms: number, callback: () => void) => {
  const handle = setTimeout(callback, ms);
  return () => clearTimeout(handle);
};

/** Starts warming `models` one after the other; returns the function that stops it (call it when the models are replaced). */
export function startWarming(models: Warmable[], { sliceMs = 8, startDelayMs = 1500, scheduler = idleScheduler, delay = timeoutDelay }: WarmOptions = {}): () => void {
  let cancelled = false;
  let cancelNext: (() => void) | undefined;
  let index = 0;

  const step = () => {
    cancelNext = undefined;
    if (cancelled) return;
    // One model's slice per turn, so a turn never runs longer than a slice.
    if (index < models.length && models[index].warm(sliceMs)) index++;
    if (index < models.length && !cancelled) cancelNext = scheduler(step);
  };

  cancelNext = delay(startDelayMs, () => {
    cancelNext = scheduler(step);
  });
  return () => {
    cancelled = true;
    cancelNext?.();
  };
}

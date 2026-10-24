/**
 * A value for each calendar day, worked out the first time it is asked for and kept. The building block of the daily
 * models (`ReadingsModel`, `ReadinessModel`): what a day's number is never depends on which window of days is on screen,
 * so every window - four weeks, a year, the previous period - is a slice of the same series.
 *
 * Days are "day indexes" (whole days since the epoch, `toUtcDayIndex`). A series belongs to one immutable snapshot of
 * the data; when the data changes a new model, and so new series, take over - nothing here is ever invalidated.
 */

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * A set of day ranges, for "these days are affected by the change". Ranges may overlap and may run to infinity
 * (`Infinity` as the end); `has` is a binary search once the ranges are merged.
 */
export class DayRanges {
  #ranges: [number, number][] = [];
  #merged = true;

  /** Adds the days from `first` to `last`, inclusive. */
  add(first: number, last: number): this {
    if (last >= first) {
      this.#ranges.push([first, last]);
      this.#merged = false;
    }
    return this;
  }

  get empty(): boolean {
    return this.#ranges.length === 0;
  }

  has(day: number): boolean {
    if (!this.#merged) this.#merge();
    let lo = 0;
    let hi = this.#ranges.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.#ranges[mid][1] < day) lo = mid + 1;
      else hi = mid;
    }
    return lo < this.#ranges.length && this.#ranges[lo][0] <= day;
  }

  #merge() {
    this.#ranges.sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const r of this.#ranges) {
      const last = out[out.length - 1];
      if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
      else out.push([r[0], r[1]]);
    }
    this.#ranges = out;
    this.#merged = true;
  }
}

export class DaySeries<T> {
  readonly #values = new Map<number, T>();
  #computed = 0;
  /** The next day the warm-up will work out, counting down; undefined before it starts. */
  #cursor: number | undefined;

  constructor(private readonly compute: (day: number) => T) {}

  get(day: number): T {
    let v = this.#values.get(day);
    if (v === undefined && !this.#values.has(day)) {
      v = this.compute(day);
      this.#computed++;
      this.#values.set(day, v);
    }
    return v as T;
  }

  /** The days from `first` to `last`, inclusive, oldest first. */
  range(first: number, last: number): T[] {
    const out: T[] = [];
    for (let day = first; day <= last; day++) out.push(this.get(day));
    return out;
  }

  /** How many days are held (for tests and diagnostics). */
  get size(): number {
    return this.#values.size;
  }

  /** How many days this series has had to work out itself, not counting ones taken over by `adopt` (for tests and diagnostics). */
  get computed(): number {
    return this.#computed;
  }

  /**
   * Takes over the days `from` already worked out, except those in `affected`. Used when a model is built from the
   * previous one after a change: the days the change can't have touched are the same, so they are not worked out again.
   * The values are shared, not copied - they are never changed. Returns how many days were taken over.
   */
  adopt(from: DaySeries<T>, affected: DayRanges): number {
    let n = 0;
    for (const [day, value] of from.#values) {
      if (affected.has(day) || this.#values.has(day)) continue;
      this.#values.set(day, value);
      n++;
    }
    return n;
  }

  /**
   * Works out days from `top` down to `bottom`, newest first (the recent days are the ones looked at), for about
   * `budgetMs`. Returns true once every day in the span is done. Safe to call again where it left off.
   */
  warmDown(top: number, bottom: number, budgetMs: number): boolean {
    const deadline = now() + budgetMs;
    this.#cursor ??= top;
    let n = 0;
    while (this.#cursor >= bottom) {
      this.get(this.#cursor);
      this.#cursor--;
      // Reading the clock costs something too: every few days is often enough.
      if (++n % 4 === 0 && now() >= deadline) return this.#cursor < bottom;
    }
    return true;
  }
}

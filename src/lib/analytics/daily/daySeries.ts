/**
 * A value for each calendar day, worked out the first time it is asked for and kept. The building block of the daily
 * models (`ReadingsModel`, `ReadinessModel`): what a day's number is never depends on which window of days is on screen,
 * so every window - four weeks, a year, the previous period - is a slice of the same series.
 *
 * Days are "day indexes" (whole days since the epoch, `toUtcDayIndex`). A series belongs to one immutable snapshot of
 * the data; when the data changes a new model, and so new series, take over - nothing here is ever invalidated.
 */

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class DaySeries<T> {
  readonly #values = new Map<number, T>();
  /** The next day the warm-up will work out, counting down; undefined before it starts. */
  #cursor: number | undefined;

  constructor(private readonly compute: (day: number) => T) {}

  get(day: number): T {
    let v = this.#values.get(day);
    if (v === undefined && !this.#values.has(day)) {
      v = this.compute(day);
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

  /** How many days are worked out so far (for tests and diagnostics). */
  get size(): number {
    return this.#values.size;
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

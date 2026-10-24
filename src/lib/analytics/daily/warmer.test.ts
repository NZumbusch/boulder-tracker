import { describe, expect, it } from "vitest";
import { startWarming, type IdleScheduler, type Warmable } from "./warmer";

/** A scheduler the test drives by hand. */
function manual() {
  const queue: (() => void)[] = [];
  const scheduler: IdleScheduler = (cb) => {
    queue.push(cb);
    return () => { const i = queue.indexOf(cb); if (i >= 0) queue.splice(i, 1); };
  };
  const delays: { ms: number; cb: () => void }[] = [];
  const delay = (ms: number, cb: () => void) => { const d = { ms, cb }; delays.push(d); return () => { const i = delays.indexOf(d); if (i >= 0) delays.splice(i, 1); }; };
  return { queue, scheduler, delays, delay, runIdle: () => queue.shift()?.() };
}

const model = (steps: number, log: string[], name: string): Warmable => {
  let left = steps;
  return { warm: () => { log.push(name); return --left <= 0; } };
};

describe("startWarming", () => {
  it("waits for the start delay, then works through the models one slice at a time, in order", () => {
    const m = manual();
    const log: string[] = [];
    startWarming([model(2, log, "a"), model(1, log, "b")], { scheduler: m.scheduler, delay: m.delay, startDelayMs: 1500 });
    expect(m.delays[0].ms).toBe(1500);
    expect(m.queue).toHaveLength(0);
    m.delays[0].cb(); // the delay is over: now wait for idle
    expect(m.queue).toHaveLength(1);
    m.runIdle(); // a, step 1
    m.runIdle(); // a, step 2 (done)
    m.runIdle(); // b
    expect(log).toEqual(["a", "a", "b"]);
    expect(m.queue).toHaveLength(0);
  });

  it("does one model's slice per turn, never two", () => {
    const m = manual();
    const log: string[] = [];
    startWarming([model(1, log, "a"), model(1, log, "b")], { scheduler: m.scheduler, delay: m.delay });
    m.delays[0].cb();
    m.runIdle();
    expect(log).toEqual(["a"]);
    expect(m.queue).toHaveLength(1);
  });

  it("stops when cancelled - before it starts and in the middle - and a new pass is independent", () => {
    const m = manual();
    const log: string[] = [];
    const stop = startWarming([model(5, log, "a")], { scheduler: m.scheduler, delay: m.delay });
    stop();
    expect(m.delays).toHaveLength(0);

    const m2 = manual();
    const log2: string[] = [];
    const stop2 = startWarming([model(5, log2, "a")], { scheduler: m2.scheduler, delay: m2.delay });
    m2.delays[0].cb();
    m2.runIdle();
    stop2();
    expect(m2.queue).toHaveLength(0);
    expect(log2).toEqual(["a"]);
  });

  it("passes the slice budget on", () => {
    const m = manual();
    const budgets: number[] = [];
    startWarming([{ warm: (b) => { budgets.push(b); return true; } }], { scheduler: m.scheduler, delay: m.delay, sliceMs: 6 });
    m.delays[0].cb();
    m.runIdle();
    expect(budgets).toEqual([6]);
  });
});

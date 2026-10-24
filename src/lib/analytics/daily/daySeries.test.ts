import { describe, expect, it } from "vitest";
import { DaySeries } from "./daySeries";

describe("DaySeries", () => {
  it("works a day out once, on first use, and keeps it", () => {
    let calls = 0;
    const s = new DaySeries((d) => { calls++; return d * 2; });
    expect(s.get(5)).toBe(10);
    expect(s.get(5)).toBe(10);
    expect(calls).toBe(1);
    expect(s.size).toBe(1);
  });

  it("keeps a day whose value is undefined or null too, without working it out again", () => {
    let calls = 0;
    const s = new DaySeries<number | null | undefined>((d) => { calls++; return d === 1 ? null : undefined; });
    s.get(1); s.get(1); s.get(2); s.get(2);
    expect(calls).toBe(2);
  });

  it("gives any window as a slice of the same days", () => {
    const s = new DaySeries((d) => ({ d }));
    const a = s.range(10, 14);
    const b = s.range(12, 16);
    expect(a.map((x) => x.d)).toEqual([10, 11, 12, 13, 14]);
    expect(b[0]).toBe(a[2]);
    expect(s.size).toBe(7);
  });

  it("warms newest first, can stop and carry on where it was, and reports when it is done", () => {
    const order: number[] = [];
    const s = new DaySeries((d) => { order.push(d); return d; });
    // A budget of nothing still makes progress (a few days), never none.
    let done = s.warmDown(30, 10, 0);
    expect(done).toBe(false);
    expect(order[0]).toBe(30);
    expect(order.length).toBeGreaterThan(0);
    let rounds = 0;
    while (!done && rounds++ < 50) done = s.warmDown(30, 10, 0);
    expect(done).toBe(true);
    expect(order).toEqual(Array.from({ length: 21 }, (_, i) => 30 - i));
    // Asking for a warmed day later is free.
    s.get(20);
    expect(order.length).toBe(21);
  });

  it("skips what a chart already asked for", () => {
    const calls: number[] = [];
    const s = new DaySeries((d) => { calls.push(d); return d; });
    s.get(25);
    s.warmDown(27, 24, 1000);
    expect(calls.filter((d) => d === 25)).toHaveLength(1);
  });
});

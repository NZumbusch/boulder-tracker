import { describe, expect, it } from "vitest";
import { fitSportName, readFitActivity } from "./fit";
import { FitWriter, fitTime, semicircles, type FieldDef } from "./fitBuilder.testutil";

const T0 = Date.UTC(2026, 9, 5, 6, 30, 0);
const REC: FieldDef[] = [
  { num: 253, size: 4, base: 0x86 },
  { num: 0, size: 4, base: 0x85 },
  { num: 1, size: 4, base: 0x85 },
  { num: 2, size: 2, base: 0x84 },
  { num: 3, size: 1, base: 0x02 },
];
const SESSION: FieldDef[] = [
  { num: 253, size: 4, base: 0x86 },
  { num: 2, size: 4, base: 0x86 },
  { num: 5, size: 1, base: 0x00 },
  { num: 7, size: 4, base: 0x86 },
  { num: 8, size: 4, base: 0x86 },
  { num: 9, size: 4, base: 0x86 },
  { num: 16, size: 1, base: 0x02 },
  { num: 17, size: 1, base: 0x02 },
  { num: 22, size: 2, base: 0x84 },
  { num: 11, size: 2, base: 0x84 },
];

function run(little = true) {
  const w = new FitWriter(little);
  w.define(0, 20, REC);
  for (let i = 0; i < 5; i++) {
    w.data(0, REC, [fitTime(T0) + i * 10, semicircles(46.5 + i * 0.001), semicircles(7.5), (500 + 300) * 5, 140 + i]);
  }
  w.define(1, 18, SESSION);
  w.data(1, SESSION, [fitTime(T0) + 60, fitTime(T0), 1, 61_000, 58_000, 123_456, 150, 172, 42, 512]);
  return w.build();
}

describe("readFitActivity", () => {
  it("reads the session summary and the GPS records", () => {
    const a = readFitActivity(run())!;
    expect(a.startMs).toBe(T0);
    expect(a.sport).toBe(1);
    expect(fitSportName(a.sport, a.subSport)).toBe("Run");
    expect(a.elapsedSec).toBe(61);
    expect(a.timerSec).toBe(58);
    expect(a.distanceM).toBeCloseTo(1234.56);
    expect(a.avgHr).toBe(150);
    expect(a.maxHr).toBe(172);
    expect(a.ascentM).toBe(42);
    expect(a.calories).toBe(512);
    expect(a.points).toHaveLength(5);
    expect(a.points[0].lat).toBeCloseTo(46.5, 5);
    expect(a.points[4].lat).toBeCloseTo(46.504, 4);
    expect(a.points[0].alt).toBeCloseTo(300, 0);
    expect(a.points[2].hr).toBe(142);
    expect(a.points[2].t).toBe(T0 + 20_000);
  });

  it("reads big-endian definitions the same", () => {
    const a = readFitActivity(run(false))!;
    expect(a.distanceM).toBeCloseTo(1234.56);
    expect(a.points[4].lat).toBeCloseTo(46.504, 4);
  });

  it("falls back to the records when there is no session", () => {
    const w = new FitWriter();
    w.define(0, 20, REC);
    for (let i = 0; i < 3; i++) w.data(0, REC, [fitTime(T0) + i * 30, semicircles(46.5), semicircles(7.5), 2500, 100 + i * 10]);
    const a = readFitActivity(w.build())!;
    expect(a.startMs).toBe(T0);
    expect(a.elapsedSec).toBe(60);
    expect(a.avgHr).toBe(110);
    expect(a.maxHr).toBe(120);
  });

  it("drops invalid values (no GPS lock) and reads compressed timestamps and developer fields", () => {
    const w = new FitWriter();
    w.define(0, 20, REC, [{ num: 0, size: 2, index: 0 }]);
    w.data(0, REC, [fitTime(T0), 0x7fffffff, 0x7fffffff, 0xffff, 0xff], 2);
    w.define(2, 20, [REC[1], REC[2]]);
    w.compressed(2, (fitTime(T0) + 5) & 0x1f, [REC[1], REC[2]], [semicircles(10), semicircles(20)]);
    const a = readFitActivity(w.build())!;
    expect(a.points).toHaveLength(2);
    expect(a.points[0].lat).toBeUndefined();
    expect(a.points[0].hr).toBeUndefined();
    expect(a.points[1].t).toBe(T0 + 5000);
    expect(a.points[1].lat).toBeCloseTo(10, 5);
  });

  it("reads chained files and survives truncation and garbage", () => {
    const one = run();
    const chained = new Uint8Array(one.length * 2);
    chained.set(one); chained.set(one, one.length);
    expect(readFitActivity(chained)!.points).toHaveLength(10);
    expect(readFitActivity(one.slice(0, one.length - 20))).not.toBeNull();
    expect(readFitActivity(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(readFitActivity(new Uint8Array(0))).toBeNull();
  });
});

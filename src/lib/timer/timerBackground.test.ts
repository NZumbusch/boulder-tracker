import { describe, it, expect } from "vitest";
import { clockElapsedMs, startClock, pauseClock, countdownRemainingMs, STOPPED_CLOCK } from "./clock";
import { upcomingAlerts, type AlertInput } from "./timerAlerts";
import { parseStoredTimer, serializeTimer, type TimerSnapshot } from "./persistTimer";

describe("clock", () => {
  it("measures from timestamps, however rarely it is read", () => {
    const running = startClock(STOPPED_CLOCK, 1_000);
    expect(clockElapsedMs(running, 181_000)).toBe(180_000);
    const paused = pauseClock(running, 61_000);
    expect(clockElapsedMs(paused, 999_999)).toBe(60_000);
    expect(clockElapsedMs(startClock(paused, 100_000), 110_000)).toBe(70_000);
  });

  it("counts a countdown down to zero and no further", () => {
    const running = startClock(STOPPED_CLOCK, 0);
    expect(countdownRemainingMs(90, running, 30_000)).toBe(60_000);
    expect(countdownRemainingMs(90, running, 500_000)).toBe(0);
  });
});

const base: AlertInput = {
  mode: "timer",
  targetSeconds: 180,
  basic: STOPPED_CLOCK,
  warningSeconds: 0,
};

describe("upcomingAlerts", () => {
  it("alerts when a running countdown ends, with an optional warning before", () => {
    const now = 10_000;
    const input = { ...base, basic: startClock(STOPPED_CLOCK, now - 60_000) };
    expect(upcomingAlerts(input, now)).toEqual([expect.objectContaining({ atMs: now + 120_000, kind: "end" })]);
    const warned = upcomingAlerts({ ...input, warningSeconds: 15 }, now);
    expect(warned.map((a) => [a.kind, a.atMs - now])).toEqual([["warning", 105_000], ["end", 120_000]]);
  });

  it("says nothing for a paused countdown or a stopwatch", () => {
    expect(upcomingAlerts(base, 0)).toEqual([]);
    expect(upcomingAlerts({ ...base, mode: "stopwatch", basic: startClock(STOPPED_CLOCK, 0) }, 5_000)).toEqual([]);
  });
});

describe("persisted timer", () => {
  const snapshot: TimerSnapshot = { mode: "timer", targetSeconds: 90, basic: { bankedMs: 12_000, runningSince: 1_700_000_000_000 } };

  it("round-trips", () => {
    expect(parseStoredTimer(serializeTimer(snapshot))).toEqual(snapshot);
  });

  it("rejects garbage without throwing", () => {
    expect(parseStoredTimer(null)).toBeNull();
    expect(parseStoredTimer("{nope")).toBeNull();
    expect(parseStoredTimer(JSON.stringify({ ...snapshot, basic: { bankedMs: -5, runningSince: null } }))).toBeNull();
    expect(parseStoredTimer(JSON.stringify({ ...snapshot, mode: "sundial" }))).toBeNull();
  });

  it("reads a snapshot from before intervals moved to the circuit runner: the stopwatch survives, an interval is dropped", () => {
    const old = { mode: "interval", targetSeconds: 60, basic: { bankedMs: 4000, runningSince: null }, spec: {}, intervalClock: { bankedMs: 1, runningSince: null } };
    expect(parseStoredTimer(JSON.stringify(old))).toEqual({ mode: "stopwatch", targetSeconds: 60, basic: { bankedMs: 0, runningSince: null } });
    expect(parseStoredTimer(JSON.stringify({ ...old, mode: "timer" }))).toEqual({ mode: "timer", targetSeconds: 60, basic: { bankedMs: 4000, runningSince: null } });
  });
});

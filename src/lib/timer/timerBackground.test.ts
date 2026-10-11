import { describe, it, expect } from "vitest";
import { clockElapsedMs, startClock, pauseClock, countdownRemainingMs, STOPPED_CLOCK } from "./clock";
import { upcomingAlerts, type AlertInput } from "./timerAlerts";
import { parseStoredTimer, serializeTimer, type TimerSnapshot } from "./persistTimer";
import { DEFAULT_SPEC } from "./intervalTimer";
import { startSetRun, finishSet } from "./setRun";

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
  spec: DEFAULT_SPEC,
  intervalClock: STOPPED_CLOCK,
  selfPaced: false,
  setRun: startSetRun(DEFAULT_SPEC),
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

  it("alerts at each set-rest end of an interval protocol and at the finish, not at the short rests", () => {
    const spec = { ...DEFAULT_SPEC, sets: 2, reps: 2, workSeconds: 7, restSeconds: 3, setRestSeconds: 120, leadInSeconds: 0 };
    const input: AlertInput = { ...base, mode: "interval", spec, intervalClock: startClock(STOPPED_CLOCK, 0) };
    const alerts = upcomingAlerts(input, 0);
    // set 1: 7 + 3 + 7 = 17 s, rest to 137 s, set 2 ends at 154 s
    expect(alerts.map((a) => [a.title, a.atMs / 1000])).toEqual([["Rest over", 137], ["Interval done", 154]]);
  });

  it("alerts when a self-paced rest ends", () => {
    const spec = { ...DEFAULT_SPEC, setRestSeconds: 120, leadInSeconds: 0 };
    let run = startSetRun(spec);
    run = finishSet(run, spec, 8);
    const input: AlertInput = { ...base, mode: "interval", spec, selfPaced: true, setRun: { ...run, sinceLastSetMs: 20_000 }, intervalClock: startClock(STOPPED_CLOCK, 0), warningSeconds: 15 };
    expect(upcomingAlerts(input, 1_000).map((a) => [a.kind, a.atMs])).toEqual([["warning", 86_000], ["end", 101_000]]);
  });
});

describe("persisted timer", () => {
  const snapshot: TimerSnapshot = {
    mode: "interval",
    targetSeconds: 90,
    basic: { bankedMs: 0, runningSince: null },
    spec: DEFAULT_SPEC,
    baseSpec: DEFAULT_SPEC,
    seededForSlotId: "slot-1",
    intervalClock: { bankedMs: 12_000, runningSince: 1_700_000_000_000 },
    expanded: true,
    timingMode: "auto",
    setRun: startSetRun(DEFAULT_SPEC),
    stagedReps: 6,
    lastTickAt: 1_700_000_005_000,
  };

  it("round-trips", () => {
    expect(parseStoredTimer(serializeTimer(snapshot))).toEqual(snapshot);
  });

  it("rejects garbage without throwing", () => {
    expect(parseStoredTimer(null)).toBeNull();
    expect(parseStoredTimer("{nope")).toBeNull();
    expect(parseStoredTimer(JSON.stringify({ ...snapshot, intervalClock: { bankedMs: -5, runningSince: null } }))).toBeNull();
    expect(parseStoredTimer(JSON.stringify({ ...snapshot, mode: "sundial" }))).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { buildLiveTimer, type LiveInput } from "./liveTimer";
import { STOPPED_CLOCK, startClock } from "./clock";

const base: LiveInput = {
  mode: "timer",
  targetSeconds: 90,
  basic: STOPPED_CLOCK,
  ticks: true,
  warningSeconds: 0,
  label: "Max Hangs",
};
const NOW = 1_000_000;

describe("buildLiveTimer", () => {
  it("has nothing to run for a stopped timer", () => {
    expect(buildLiveTimer(base, NOW)).toBeNull();
    expect(buildLiveTimer({ ...base, mode: "stopwatch" }, NOW)).toBeNull();
  });

  it("counts a running countdown down, with 3-2-1, an optional warning and the finish", () => {
    const input = { ...base, basic: startClock(STOPPED_CLOCK, NOW - 30_000), warningSeconds: 15 };
    const live = buildLiveTimer(input, NOW)!;
    const end = NOW + 60_000;
    expect(live.segments).toEqual([{ endsAt: end, title: "Countdown", body: "Max Hangs" }]);
    expect(live.cues.map((c) => [c.kind, c.at - end])).toEqual([["warn", -15_000], ["tick", -3000], ["tick", -2000], ["tick", -1000], ["done", 0]]);
    expect(live.actions).toEqual(["pause", "add30"]);
  });

  it("leaves the 3-2-1 out when it is switched off", () => {
    const live = buildLiveTimer({ ...base, ticks: false, basic: startClock(STOPPED_CLOCK, NOW) }, NOW)!;
    expect(live.cues.map((c) => c.kind)).toEqual(["done"]);
  });

  it("shows a paused countdown frozen, with Resume", () => {
    const live = buildLiveTimer({ ...base, basic: { bankedMs: 30_000, runningSince: null } }, NOW)!;
    expect(live.segments[0]).toEqual({ title: "Countdown paused · 1:00 left", body: "Max Hangs" });
    expect(live.cues).toEqual([]);
    expect(live.actions).toEqual(["resume"]);
  });

  it("counts a stopwatch up from when it started", () => {
    const live = buildLiveTimer({ ...base, mode: "stopwatch", basic: startClock(STOPPED_CLOCK, NOW - 5000) }, NOW)!;
    expect(live.segments[0].startedAt).toBe(NOW - 5000);
  });

  it("keeps a paused stopwatch in the notification, frozen, with Resume", () => {
    const paused = { ...STOPPED_CLOCK, bankedMs: 5000 };
    const live = buildLiveTimer({ ...base, mode: "stopwatch", basic: paused }, NOW)!;
    expect(live.segments).toEqual([{ title: "Stopwatch paused · 0:05", body: "Max Hangs" }]);
    expect(live.actions).toEqual(["resume"]);
  });
});

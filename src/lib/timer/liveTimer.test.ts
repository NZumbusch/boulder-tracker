import { describe, it, expect } from "vitest";
import { buildLiveTimer, type LiveInput } from "./liveTimer";
import { STOPPED_CLOCK, startClock } from "./clock";
import { DEFAULT_SPEC } from "./intervalTimer";
import { startSetRun, finishSet } from "./setRun";

const base: LiveInput = {
  mode: "timer",
  targetSeconds: 90,
  basic: STOPPED_CLOCK,
  spec: DEFAULT_SPEC,
  intervalClock: STOPPED_CLOCK,
  selfPaced: false,
  setRun: startSetRun(DEFAULT_SPEC),
  ticks: true,
  warningSeconds: 0,
  label: "Max Hangs",
  workLabel: "Hang",
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

  it("plans a whole interval protocol: a segment per phase and a cue at each change", () => {
    const spec = { ...DEFAULT_SPEC, sets: 2, reps: 2, workSeconds: 7, restSeconds: 3, setRestSeconds: 60, leadInSeconds: 0 };
    const live = buildLiveTimer({ ...base, mode: "interval", spec, ticks: false, intervalClock: startClock(STOPPED_CLOCK, NOW) }, NOW)!;
    expect(live.segments.map((s) => s.title)).toEqual([
      "Hang · Set 1/2 · Rep 1/2", "Rest · Set 1/2 · Rep 1/2", "Hang · Set 1/2 · Rep 2/2", "Set rest · Set 1/2",
      "Hang · Set 2/2 · Rep 1/2", "Rest · Set 2/2 · Rep 1/2", "Hang · Set 2/2 · Rep 2/2",
    ].map((t) => expect.stringContaining(t.split(" · ")[1] ?? t)));
    const kinds = live.cues.map((c) => [c.kind, (c.at - NOW) / 1000]);
    expect(kinds).toEqual([["rest", 7], ["work", 10], ["setRest", 17], ["work", 77], ["rest", 84], ["work", 87], ["done", 94]]);
  });

  it("starts the plan mid-protocol from where the clock is", () => {
    const spec = { ...DEFAULT_SPEC, sets: 1, reps: 2, workSeconds: 10, restSeconds: 5, setRestSeconds: 0, leadInSeconds: 0 };
    const live = buildLiveTimer({ ...base, mode: "interval", spec, ticks: false, intervalClock: startClock(STOPPED_CLOCK, NOW - 12_000) }, NOW)!;
    expect(live.segments[0].endsAt).toBe(NOW + 3000);
    expect(live.cues.map((c) => [c.kind, (c.at - NOW) / 1000])).toEqual([["work", 3], ["done", 13]]);
  });

  it("times a self-paced rest and announces the next set", () => {
    const spec = { ...DEFAULT_SPEC, sets: 4, setRestSeconds: 120, leadInSeconds: 0 };
    const run = { ...finishSet(startSetRun(spec), spec, 8), sinceLastSetMs: 20_000 };
    const live = buildLiveTimer({ ...base, mode: "interval", spec, selfPaced: true, setRun: run, intervalClock: startClock(STOPPED_CLOCK, NOW) }, NOW)!;
    expect(live.segments[0]).toEqual({ endsAt: NOW + 100_000, title: "Rest · next: Set 2 of 4", body: "Max Hangs" });
    expect(live.cues.at(-1)).toEqual({ at: NOW + 100_000, kind: "work" });
  });

  it("speaks the next set during a self-paced rest in Auto: at the start, and again near the end of a long rest", () => {
    const spec = { ...DEFAULT_SPEC, sets: 4, setRestSeconds: 120, leadInSeconds: 0 };
    const run = { ...finishSet(startSetRun(spec), spec, 8), sinceLastSetMs: 0 };
    const announce = { enabled: true, mode: "auto" as const, work: true, workLead: 0, restStart: true, restStartDelay: 0, restEnd: 0 };
    const live = buildLiveTimer({ ...base, mode: "interval", spec, selfPaced: true, setRun: run, intervalClock: startClock(STOPPED_CLOCK, NOW), announce }, NOW)!;
    const spoken = live.cues.filter((c) => c.kind === "speak");
    expect(spoken.map((c) => c.text)).toEqual(["Rest. Next\u001fset 2 of 4", "Next\u001fset 2 of 4"]);
    expect(spoken[1].at).toBeLessThan(NOW + 120_000);
    expect(live.cues.some((c) => c.kind === "speak")).toBe(true);
    const off = buildLiveTimer({ ...base, mode: "interval", spec, selfPaced: true, setRun: run, intervalClock: startClock(STOPPED_CLOCK, NOW) }, NOW)!;
    expect(off.cues.some((c) => c.kind === "speak")).toBe(false);
  });
});

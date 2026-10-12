import { describe, expect, it } from "vitest";
import type { ExerciseSlot, ExerciseValues } from "../types";
import { buildCircuitLive, circuitAlerts, circuitLoggedValues, circuitSteps, replanRun, startCircuitRun, tickCircuitRun, type CircuitStep } from "./circuitRun";
import { DEFAULT_PACER_PROBLEMS, hasRunnableTiming, isPacer, pacerProblems, soloRun } from "./soloRun";

const slot = (id = "s") => ({ id, typeId: "t" }) as ExerciseSlot;
const stepsOf = (v: ExerciseValues, leadIn?: number) => {
  const run = soloRun(v);
  return { run, steps: circuitSteps(run.group, [{ slot: slot(), values: run.values }], leadIn ?? run.leadIn) };
};
const seconds = (steps: CircuitStep[]) => steps.reduce((t, s) => t + (s.kind === "work" ? (s.seconds ?? 0) : s.seconds), 0);

describe("soloRun: one exercise as a run of the circuit engine", () => {
  it("a repeater runs sets x reps x on/off with the set rest and the lead-in", () => {
    const values: ExerciseValues = { sets: 4, reps: 6, timeOn: 7, timeOff: 3, timeBetweenSets: 180 };
    const { run, steps } = stepsOf(values);
    expect(run.kind).toBe("timed");
    // 10 s get-ready + 4 sets of (6 hangs x 7 s + 5 rests x 3 s) + 3 set rests of 180 s
    expect(seconds(steps)).toBe(10 + 4 * (6 * 7 + 5 * 3) + 3 * 180);
    expect(steps.filter((s) => s.kind === "work")).toHaveLength(4);
    expect(steps.filter((s) => s.kind === "roundRest")).toHaveLength(3);
  });

  it("counted sets are open steps with the rest between them", () => {
    const { run, steps } = stepsOf({ sets: 3, reps: 6, timeOff: 150 });
    expect(run.kind).toBe("counted");
    const work = steps.filter((s) => s.kind === "work");
    expect(work).toHaveLength(3);
    expect(work.every((s) => s.kind === "work" && s.seconds === undefined && s.reps === 6)).toBe(true);
    expect(steps.filter((s) => s.kind === "roundRest").map((s) => s.seconds)).toEqual([150, 150]);
  });

  it("a long hold is one timed set; nothing at all is an open stopwatch", () => {
    const hold = stepsOf({ sets: 1, reps: 1, timeOn: 90 }).steps.filter((s) => s.kind === "work");
    expect(hold).toHaveLength(1);
    expect(hold[0]).toMatchObject({ seconds: 90 });
    const empty = soloRun({ sets: 1 });
    const work = circuitSteps(empty.group, [{ slot: slot(), values: empty.values }], 0).filter((s) => s.kind === "work");
    expect(work[0]).toMatchObject({ kind: "work" });
    expect(work[0].kind === "work" && work[0].seconds).toBeUndefined();
  });

  it("per-set hang times run as set (a ramp), not averaged", () => {
    const values: ExerciseValues = { sets: 3, reps: 1, timeOn: 8, setDetails: [{ timeOn: 10 }, { timeOn: 8 }, { timeOn: 6 }], timeBetweenSets: 60 };
    const work = stepsOf(values).steps.filter((s) => s.kind === "work");
    expect(work.map((s) => s.kind === "work" && s.seconds)).toEqual([10, 8, 6]);
  });

  it("an explicit 0 rest is honoured; a rest never given falls back to the setting (only with several sets)", () => {
    expect(soloRun({ sets: 3, timeOn: 5, timeBetweenSets: 0 }, { setRest: 90 }).group.roundRest).toBe(0);
    expect(soloRun({ sets: 3, timeOn: 5 }, { setRest: 90 }).group.roundRest).toBe(90);
    expect(soloRun({ sets: 1, timeOn: 5 }, { setRest: 90 }).group.roundRest).toBe(0);
    expect(soloRun({ sets: 3, reps: 5, timeOff: 150 }).group.roundRest).toBe(150); // a counted exercise's timeOff is its set rest
    expect(soloRun({ sets: 3, timeOn: 5, timeOff: 0, timeBetweenSets: 60 }).values.timeOff).toBe(0);
  });

  it("the lead-in is the exercise's own, else the setting's, else 10 s; 0 is allowed", () => {
    expect(soloRun({ timeOn: 7 }).leadIn).toBe(10);
    expect(soloRun({ timeOn: 7 }, { leadIn: 5 }).leadIn).toBe(5);
    expect(soloRun({ timeOn: 7, leadIn: 20 }, { leadIn: 5 }).leadIn).toBe(20);
    expect(soloRun({ timeOn: 7, leadIn: 0 }, { leadIn: 5 }).leadIn).toBe(0);
  });
});

describe("the pacer", () => {
  it("is a cadence with nothing that makes it a timed or counted set", () => {
    expect(isPacer({ cadence: 4, duration: 60 })).toBe(true);
    expect(isPacer({ cadence: 4, reps: 5 })).toBe(false);
    expect(isPacer({ cadence: 4, timeOn: 7 })).toBe(false);
    expect(isPacer({ duration: 60 })).toBe(false);
  });

  it("counts problems from sets, else duration over cadence, else a default", () => {
    expect(pacerProblems({ cadence: 6, duration: 60 })).toBe(10);
    expect(pacerProblems({ cadence: 4, duration: 50 })).toBe(13);
    expect(pacerProblems({ cadence: 6, duration: 60, sets: 7 })).toBe(7);
    expect(pacerProblems({ cadence: 6 })).toBe(DEFAULT_PACER_PROBLEMS);
  });

  it("runs one timed step per problem, back to back, labelled", () => {
    const { run, steps } = stepsOf({ cadence: 6, duration: 30 }, 0);
    expect(run.kind).toBe("pacer");
    const work = steps.filter((s) => s.kind === "work");
    expect(work).toHaveLength(5);
    expect(work.every((s) => s.kind === "work" && s.seconds === 360 && s.label === "Problem")).toBe(true);
    expect(steps.every((s) => s.kind === "work")).toBe(true);
  });

  it("logs what happened: problems done, minutes spent, the pace kept - which is what load reads", () => {
    const run = soloRun({ cadence: 6, duration: 60, notes: "plan note" });
    const members = [{ slot: slot(), values: run.values }];
    const steps = circuitSteps(run.group, members, 0);
    let state = startCircuitRun();
    state = tickCircuitRun(steps, state, 3 * 360 * 1000); // three problems done in full
    const out = circuitLoggedValues(members, state)["s"]!;
    expect(out).toMatchObject({ sets: 3, duration: 18, cadence: 6 });
    expect(out.notes).toBeUndefined();
  });
});

describe("hasRunnableTiming", () => {
  it("is true for any timing a run can use, including a cadence", () => {
    expect(hasRunnableTiming({ cadence: 5 })).toBe(true);
    expect(hasRunnableTiming({ sets: 3, reps: 5 })).toBe(true);
    expect(hasRunnableTiming({ reps: [5, 5, 4] })).toBe(true);
    expect(hasRunnableTiming({ notes: "x", weight: 10 })).toBe(false);
    expect(hasRunnableTiming(undefined)).toBe(false);
  });
});

describe("replanRun: changing numbers while it runs", () => {
  it("keeps the same step when a rest appears and shifts the indexes", () => {
    const a = soloRun({ sets: 3, reps: 5, timeOn: 7, timeOff: 3, timeBetweenSets: 0 });
    const members = (r: typeof a) => [{ slot: slot(), values: r.values }];
    const before = circuitSteps(a.group, members(a), 0);
    expect(before.every((s) => s.kind === "work")).toBe(true);
    // two sets done, third running
    let state = tickCircuitRun(before, startCircuitRun(), 2 * 47_000 + 5_000);
    expect(state.stepIndex).toBe(2);
    const b = soloRun({ sets: 3, reps: 5, timeOn: 7, timeOff: 3, timeBetweenSets: 90 });
    const after = circuitSteps(b.group, members(b), 0);
    state = replanRun(before, state, after);
    const cur = after[state.stepIndex];
    expect(cur).toMatchObject({ kind: "work", round: 2 });
    expect(state.done).toBe(false);
  });

  it("ends the run when the step is gone (rounds cut below where it is)", () => {
    const a = soloRun({ sets: 4, reps: 1, timeOn: 5 });
    const b = soloRun({ sets: 2, reps: 1, timeOn: 5 });
    const mk = (r: typeof a) => circuitSteps(r.group, [{ slot: slot(), values: r.values }], 0);
    let state = tickCircuitRun(mk(a), startCircuitRun(), 3 * 5000 + 100 + 3 * 180_000);
    expect(replanRun(mk(a), state, mk(b)).done).toBe(true);
  });
});

describe("background alerts without the service", () => {
  const names = (m: number) => (m === 0 ? "Pull-ups" : "Push-ups");
  const NOW = 1_000_000;

  it("alerts at each set rest's end and the finish, not at the short rests inside a repeater", () => {
    const run = soloRun({ sets: 2, reps: 2, timeOn: 7, timeOff: 3, timeBetweenSets: 120 }, { leadIn: 0 } as never);
    const steps = circuitSteps(run.group, [{ slot: slot(), values: run.values }], 0);
    const alerts = circuitAlerts({ steps, state: startCircuitRun(), running: true, name: "Hangs", memberName: names, warningSeconds: 15 }, NOW);
    // set 1: 7+3+7 = 17 s, rest to 137 s, set 2 ends at 154 s
    expect(alerts.map((a) => [a.kind, a.title, (a.atMs - NOW) / 1000])).toEqual([["warning", "15 s left", 122], ["end", "Rest over", 137], ["end", "Hangs done", 154]]);
  });

  it("alerts at each pacer problem, and says nothing paused, finished or for an open counted set", () => {
    const run = soloRun({ cadence: 6, sets: 3 });
    const steps = circuitSteps(run.group, [{ slot: slot(), values: run.values }], 0);
    const alerts = circuitAlerts({ steps, state: startCircuitRun(), running: true, name: "Pacer", memberName: names, warningSeconds: 0 }, NOW);
    expect(alerts.map((a) => [a.title, (a.atMs - NOW) / 1000])).toEqual([["Problem 2", 360], ["Problem 3", 720], ["Pacer done", 1080]]);
    expect(circuitAlerts({ steps, state: startCircuitRun(), running: false, name: "Pacer", memberName: names, warningSeconds: 0 }, NOW)).toEqual([]);
    const counted = soloRun({ sets: 3, reps: 5, timeBetweenSets: 90 });
    const cs = circuitSteps(counted.group, [{ slot: slot(), values: counted.values }], 0);
    expect(circuitAlerts({ steps: cs, state: startCircuitRun(), running: true, name: "x", memberName: names, warningSeconds: 0 }, NOW)).toEqual([]);
  });

  it("counts from where the run is", () => {
    const run = soloRun({ cadence: 6, sets: 3 });
    const steps = circuitSteps(run.group, [{ slot: slot(), values: run.values }], 0);
    const state = tickCircuitRun(steps, startCircuitRun(), 100_000);
    expect(circuitAlerts({ steps, state, running: true, name: "Pacer", memberName: names, warningSeconds: 0 }, NOW).map((a) => (a.atMs - NOW) / 1000)).toEqual([260, 620, 980]);
  });
});

describe("the notification's second line for a single exercise", () => {
  it("reads Set n/N or Problem n/N, without a round", () => {
    const set = soloRun({ sets: 3, reps: 5, timeOn: 7, timeBetweenSets: 60 });
    const steps = circuitSteps(set.group, [{ slot: slot(), values: set.values }], 0);
    const live = buildCircuitLive({ steps, state: startCircuitRun(), running: true, name: "Hangs", memberName: () => "Hangs", ticks: false, warningSeconds: 0 }, 0)!;
    expect(live.segments[0].body).toBe("Hangs · Set 1/3");
    const pace = soloRun({ cadence: 5, sets: 4 });
    const ps = circuitSteps(pace.group, [{ slot: slot(), values: pace.values }], 0);
    const pl = buildCircuitLive({ steps: ps, state: startCircuitRun(), running: true, name: "Pacer", memberName: () => "Pacer", ticks: false, warningSeconds: 0 }, 0)!;
    expect(pl.segments[0].title).toBe("Problem 1 · Pacer");
    expect(pl.segments[0].body).toBe("Pacer · Problem 1/4");
  });
});

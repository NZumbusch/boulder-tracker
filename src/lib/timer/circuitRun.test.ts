import { describe, expect, it } from "vitest";
import type { ExerciseGroup, ExerciseSlot } from "../types";
import {
  buildCircuitLive,
  circuitLoggedValues,
  circuitProgress,
  circuitSteps,
  currentStep,
  finishCircuitStep,
  previousWork,
  setCircuitResult,
  skipCircuitStep,
  startCircuitRun,
  stepRemainingSeconds,
  tickCircuitRun,
  upcomingWork,
} from "./circuitRun";

const member = (id: string, prescribed: ExerciseSlot["prescribed"]) => ({ slot: { id, typeId: "t", prescribed } as ExerciseSlot, values: prescribed! });

// A circuit: 1 min twists, 15 s switch, 12 push-ups, 1 min after each round.
const group: ExerciseGroup = { id: "g", rounds: 2, transition: 15, roundRest: 60 };
const members = [member("twist", { timeOn: 60 }), member("push", { reps: 12 })];
const steps = circuitSteps(group, members);

describe("circuitSteps", () => {
  it("lays out lead-in, rounds of work with switches between, and the rest between rounds", () => {
    expect(steps.map((s) => (s.kind === "work" ? `${s.slotId}${s.round}${s.seconds ? `:${s.seconds}s` : `:${s.reps}r`}` : `${s.kind}:${s.seconds}`))).toEqual([
      "leadIn:5",
      "twist0:60s", "transition:15", "push0:12r",
      "roundRest:60",
      "twist1:60s", "transition:15", "push1:12r",
    ]);
  });

  it("leaves out zero rests and members that sat a round out", () => {
    const s = circuitSteps({ id: "g", rounds: 3 }, [member("a", { timeOn: 10 }), member("b", { sets: 1, reps: 5 })], 0);
    expect(s.map((x) => x.kind === "work" ? `${x.slotId}${x.round}` : x.kind)).toEqual(["a0", "b0", "a1", "a2"]);
  });

  it("counts a repeater set down as one: reps x hang with the rest between reps", () => {
    const s = circuitSteps({ id: "g", rounds: 1 }, [member("hang", { reps: 6, timeOn: 7, timeOff: 3 })], 0);
    expect(s[0]).toMatchObject({ kind: "work", seconds: 57, reps: 6 });
  });
});

describe("running", () => {
  it("moves through timed steps by itself, carrying extra time over", () => {
    let st = tickCircuitRun(steps, startCircuitRun(), 5_000 + 60_000 + 20_000);
    // lead-in (5) + twist (60) + switch (15) = 80 s -> 5 s into push-ups
    expect(currentStep(steps, st)).toMatchObject({ kind: "work", slotId: "push" });
    expect(st.stepElapsedMs).toBe(5_000);
    expect(st.results.twist).toEqual([60]);
    // an open set stays open however long it takes
    st = tickCircuitRun(steps, st, 600_000);
    expect(currentStep(steps, st)).toMatchObject({ slotId: "push" });
    expect(stepRemainingSeconds(steps, st)).toBeUndefined();
  });

  it("records reps on Done, lets them be corrected in the rest after, and ends the run", () => {
    let st = tickCircuitRun(steps, startCircuitRun(), 80_000);
    st = finishCircuitStep(steps, st, 10);
    expect(currentStep(steps, st)).toMatchObject({ kind: "roundRest" });
    expect(previousWork(steps, st)).toMatchObject({ slotId: "push", round: 0 });
    expect(upcomingWork(steps, st)).toMatchObject({ slotId: "twist", round: 1 });
    st = setCircuitResult(st, "push", 0, 11);
    st = finishCircuitStep(steps, st); // cut the rest short
    st = finishCircuitStep(steps, st); // end the timed set early
    st = skipCircuitStep(steps, st); // skip the switch
    st = finishCircuitStep(steps, st); // push-ups at target
    expect(st.done).toBe(true);
    expect(st.results).toEqual({ twist: [60, 0], push: [11, 12] });
    expect(circuitProgress(steps, st)).toEqual({ round: 2, rounds: 2, sets: 4, totalSets: 4 });
  });

  it("logs sets done and per-set reps, and nothing for a member that did no set", () => {
    let st = tickCircuitRun(steps, startCircuitRun(), 80_000);
    st = skipCircuitStep(steps, st); // push-ups round 1 skipped
    const out = circuitLoggedValues(members, { ...st, results: { twist: [60, 60], push: [null, null] } });
    expect(out.twist).toEqual({ timeOn: 60, sets: 2 });
    expect(out.push).toBeUndefined();
    const some = circuitLoggedValues(members, { ...st, results: { push: [12, null] } });
    expect(some.push).toEqual({ reps: [12], sets: 1 });
  });
});

describe("buildCircuitLive", () => {
  const input = (state = startCircuitRun(), running = true) => ({
    steps, state, running, name: "Core", memberName: (i: number) => ["Twists", "Push-ups"][i], ticks: false, warningSeconds: 0,
  });

  it("schedules every step up to the next open set", () => {
    const plan = buildCircuitLive(input(), 1_000_000)!;
    expect(plan.segments.map((s) => s.title)).toEqual(["Get ready", "Round 1/2 · Twists", "Switch · next: Push-ups", "Round 1/2 · Push-ups · 12 reps"]);
    expect(plan.segments[3].startedAt).toBe(1_000_000 + 80_000);
    expect(plan.cues.map((c) => c.kind)).toEqual(["work", "rest", "work"]);
  });

  it("freezes while paused and is null once done", () => {
    expect(buildCircuitLive(input(startCircuitRun(), false), 0)!.actions).toEqual(["resume"]);
    expect(buildCircuitLive(input({ ...startCircuitRun(), done: true }), 0)).toBeNull();
  });
});

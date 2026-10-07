import { describe, expect, it } from "vitest";
import type { ExerciseGroup, ExerciseSlot } from "../types";
import {
  buildCircuitLive,
  circuitLoggedValues,
  previousCircuitStep,
  repeaterPosition,
  roundsDone,
  stepsEndingAfterRound,
  currentRound,
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

  it("does not log the plan's note as how it went", () => {
    const noted = members.map((m) => ({ ...m, values: { ...m.values, notes: "Slow and controlled" } }));
    const out = circuitLoggedValues(noted, { ...startCircuitRun(), results: { twist: [60] } });
    expect(out.twist).toEqual({ timeOn: 60, sets: 1 });
  });
});

describe("previousCircuitStep", () => {
  it("restarts the step when it is well under way, goes back to the one before when it has just begun", () => {
    let st = tickCircuitRun(steps, startCircuitRun(), 5000); // lead-in over
    st = tickCircuitRun(steps, st, 20_000); // twists 60 s, 20 s in
    const restarted = previousCircuitStep(steps, st);
    expect(restarted.stepIndex).toBe(st.stepIndex);
    expect(restarted.stepElapsedMs).toBe(0);
    const fresh = tickCircuitRun(steps, st, 45_000); // twists done (60 s) and into the next step
    const back = previousCircuitStep(steps, { ...fresh, stepElapsedMs: 1000 });
    expect(back.stepIndex).toBe(fresh.stepIndex - 1);
    expect(back.stepElapsedMs).toBe(0);
  });

  it("takes back the set it goes back over, so it is done again", () => {
    let st = tickCircuitRun(steps, startCircuitRun(), 5000);
    st = tickCircuitRun(steps, st, 60_000); // twists round 1 done in full
    expect(st.results.twist).toEqual([60]);
    const back = previousCircuitStep(steps, { ...st, stepElapsedMs: 500 });
    expect(back.results.twist).toEqual([]);
    expect(steps[back.stepIndex].kind).toBe("work");
  });

  it("never goes back into the lead-in, and does nothing once done", () => {
    const first = tickCircuitRun(steps, startCircuitRun(), 5000);
    expect(previousCircuitStep(steps, { ...first, stepElapsedMs: 100 }).stepIndex).toBe(first.stepIndex);
    const done = { ...first, done: true };
    expect(previousCircuitStep(steps, done)).toBe(done);
  });
});

describe("buildCircuitLive", () => {
  const input = (state = startCircuitRun(), running = true) => ({
    steps, state, running, name: "Core", memberName: (i: number) => ["Twists", "Push-ups"][i], ticks: false, warningSeconds: 0,
  });

  it("schedules every step up to the next open set", () => {
    const plan = buildCircuitLive(input(), 1_000_000)!;
    expect(plan.segments.map((s) => s.title)).toEqual(["Get ready", "Go · Twists", "Switch · next: Push-ups", "Go · Push-ups · 12 reps"]);
    expect(plan.segments.map((s) => s.body)).toEqual([
      "Core · Round 1/2 · Set 1/4", "Core · Round 1/2 · Set 1/4", "Core · Round 1/2 · Set 2/4", "Core · Round 1/2 · Set 2/4",
    ]);
    expect(plan.segments[3].startedAt).toBe(1_000_000 + 80_000);
    expect(plan.cues.map((c) => c.kind)).toEqual(["work", "rest", "work"]);
  });

  it("speaks the exercises when asked: the set's name on its start, \"next\" when a rest begins and before it ends", () => {
    const announce = { enabled: true, mode: "custom" as const, work: true, workLead: 3, restStart: true, restStartDelay: 1, restEnd: 5 };
    const at = 1_000_000;
    // Twists 5 s in: transition (15 s) next, then push-ups (open), nothing further is scheduled past it.
    const plan = buildCircuitLive({ ...input({ ...startCircuitRun(), stepIndex: 1, stepElapsedMs: 10_000 }), announce }, at)!;
    const spoken = plan.cues.filter((c) => c.kind === "speak").map((c) => [c.text, c.at - at]);
    expect(spoken).toEqual([
      ["Next\u001fPush-ups", 50_000 + 1000], // transition begins when the 60 s twists end; +1 s delay
      ["Next\u001fPush-ups", 50_000 + 15_000 - 5000], // 5 s before the switch ends
      ["Push-ups", 65_000 - 3000], // the set's name 3 s before it starts
    ].sort((a, b) => (a[1] as number) - (b[1] as number)));
  });

  it("in Auto, names each set once - in the rest before it when it fits, as the set starts when it does not", () => {
    const at = 1_000_000;
    const auto = { enabled: true, mode: "auto" as const, work: true, workLead: 0, restStart: true, restStartDelay: 0, restEnd: 0 };
    const plan = buildCircuitLive({ ...input(), announce: auto }, at)!;
    const spoken = plan.cues.filter((c) => c.kind === "speak").map((c) => [c.text, (c.at - at) / 1000]);
    expect(spoken.map((s) => s[0])).toEqual([
      "Get ready. Next\u001fTwists, 1 minute", // 5 s lead-in has room for it
      "Next\u001fPush-ups, 12 reps", // the 15 s switch
    ]);
    // Twists are named by the lead-in, so there is no second "Twists" as the set starts.
    expect(spoken.filter((s) => String(s[0]).startsWith("Twists"))).toHaveLength(0);
  });

  it("in Auto, later rounds say less: no 'Rest.' and no target that has not changed", () => {
    const at = 1_000_000;
    const auto = { enabled: true, mode: "auto" as const, work: true, workLead: 0, restStart: true, restStartDelay: 0, restEnd: 0 };
    // Round 1 done: now in the 60 s rest before round 2 (twists, 1 minute, same as before).
    const rest = steps.findIndex((s) => s.kind === "roundRest");
    const plan = buildCircuitLive({ ...input({ ...startCircuitRun(), stepIndex: rest, stepElapsedMs: 0 }), announce: auto }, at)!;
    const spoken = plan.cues.filter((c) => c.kind === "speak").map((c) => c.text);
    expect(spoken[0]).toBe("Next\u001fTwists");
    expect(spoken.some((t) => String(t).includes("Rest."))).toBe(false);
  });

  it("says nothing when announcements are off", () => {
    const plan = buildCircuitLive({ ...input(), announce: { enabled: false, mode: "custom" as const, work: true, workLead: 0, restStart: true, restStartDelay: 0, restEnd: 5 } }, 0)!;
    expect(plan.cues.some((c) => c.kind === "speak")).toBe(false);
  });

  it("freezes while paused and is null once done", () => {
    expect(buildCircuitLive(input(startCircuitRun(), false), 0)!.actions).toEqual(["resume"]);
    expect(buildCircuitLive(input({ ...startCircuitRun(), done: true }), 0)).toBeNull();
  });
});

describe("repeaters in a circuit", () => {
  const repGroup: ExerciseGroup = { id: "g", rounds: 2, roundRest: 90 };
  const hang = member("hang", { reps: 4, timeOn: 7, timeOff: 3 });
  const rows = member("rows", { reps: 10 });
  const rsteps = circuitSteps(repGroup, [hang, rows], 0);

  it("keeps one timed step for the set and describes its hang/rest repeats", () => {
    expect(rsteps[0]).toMatchObject({ kind: "work", seconds: 37, reps: 4, interval: { reps: 4, on: 7, off: 3 } });
    expect(rsteps.find((s) => s.kind === "work" && s.slotId === "rows")).not.toHaveProperty("interval");
  });

  it("does not treat a single hang as a repeater", () => {
    expect(circuitSteps({ id: "g", rounds: 1 }, [member("h", { reps: 1, timeOn: 10 })], 0)[0]).not.toHaveProperty("interval");
  });

  it("finds the hang or rest the clock is in", () => {
    const spec = { reps: 4, on: 7, off: 3 };
    expect(repeaterPosition(spec, 0)).toEqual({ rep: 1, phase: "on", remaining: 7, length: 7 });
    expect(repeaterPosition(spec, 8_000)).toMatchObject({ rep: 1, phase: "off", remaining: 2, length: 3 });
    expect(repeaterPosition(spec, 10_000)).toMatchObject({ rep: 2, phase: "on", remaining: 7 });
    expect(repeaterPosition(spec, 36_000)).toMatchObject({ rep: 4, phase: "on", remaining: 1 });
  });

  it("splits the notification into hang and rest stretches with a beep at each switch", () => {
    const plan = buildCircuitLive({ steps: rsteps, state: startCircuitRun(), running: true, name: "Fingers", memberName: (i: number) => ["Repeaters", "Rows"][i], ticks: false, warningSeconds: 0 }, 1_000_000)!;
    expect(plan.segments.slice(0, 4).map((s) => s.title)).toEqual(["Hang 1/4 · Repeaters", "Rest 1/4 · next hang", "Hang 2/4 · Repeaters", "Rest 2/4 · next hang"]);
    expect(plan.segments[0].endsAt).toBe(1_007_000);
    expect(plan.segments[1].endsAt).toBe(1_010_000);
    expect(plan.cues.slice(0, 3)).toEqual([{ at: 1_007_000, kind: "rest" }, { at: 1_010_000, kind: "work" }, { at: 1_017_000, kind: "rest" }]);
    expect(plan.segments.at(-1)?.startedAt).toBe(1_037_000); // then the open rows
  });
});

describe("ending a circuit early", () => {
  it("cuts the run after a round, dropping the rest after it and the rounds to come", () => {
    const cut = stepsEndingAfterRound(steps, 0);
    expect(cut.map((s) => s.kind)).toEqual(["leadIn", "work", "transition", "work"]);
    expect(stepsEndingAfterRound(steps, 1)).toEqual(steps);
  });

  it("is over when that round's last set is done, with the rounds so far to log", () => {
    const cut = stepsEndingAfterRound(steps, 0);
    let st = tickCircuitRun(cut, startCircuitRun(), 5_000 + 60_000 + 15_000);
    st = finishCircuitStep(cut, st, 11);
    expect(st.done).toBe(true);
    expect(roundsDone(cut, st, 2)).toEqual({ done: 1, planned: 2 });
    expect(circuitLoggedValues(members, st)).toMatchObject({ twist: { sets: 1 }, push: { sets: 1, reps: [11] } });
  });

  it("counts only rounds finished in full", () => {
    let st = tickCircuitRun(steps, startCircuitRun(), 5_000 + 60_000 + 15_000);
    expect(roundsDone(steps, st, 2).done).toBe(0);
    st = finishCircuitStep(steps, st, 12);
    expect(roundsDone(steps, st, 2).done).toBe(1);
    expect(currentRound(steps, st)).toBe(1);
  });

  it("logs nothing for a member the run never reached", () => {
    const st = tickCircuitRun(steps, startCircuitRun(), 5_000 + 30_000);
    expect(circuitLoggedValues(members, st).push).toBeUndefined();
  });
});

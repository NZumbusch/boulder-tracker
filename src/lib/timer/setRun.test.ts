import { describe, it, expect } from "vitest";
import {
  startSetRun,
  setRunPhase,
  isResting,
  tickSetRun,
  finishSet,
  undoLastSet,
  skipLeadIn,
  restRemainingSeconds,
  hasRestElapsed,
  setRunProgress,
  setRunLoggedValues,
  isSelfPaced,
  type SetRunState,
} from "./setRun";
import type { IntervalSpec } from "./intervalTimer";

/** 4x6 weighted pull-ups, 180s between sets - the case that drove this. */
const PULLUPS: IntervalSpec = {
  sets: 4,
  reps: 6,
  workSeconds: 1,
  restSeconds: 0,
  setRestSeconds: 180,
  leadInSeconds: 10,
};

const SEC = 1000;

/** Finishes `count` sets at the planned reps, resting the full target between each. */
function runSets(spec: IntervalSpec, count: number, reps?: number[]): SetRunState {
  let state = skipLeadIn(startSetRun(spec));
  for (let i = 0; i < count; i++) {
    state = finishSet(state, spec, reps?.[i] ?? spec.reps);
    state = tickSetRun(state, spec.setRestSeconds * SEC);
  }
  return state;
}

describe("starting a run", () => {
  it("begins on the lead-in, at set 1, with nothing done", () => {
    const state = startSetRun(PULLUPS);
    expect(setRunPhase(state)).toBe("leadIn");
    expect(state.currentSet).toBe(1);
    expect(state.completed).toEqual([]);
    expect(state.done).toBe(false);
  });

  it("goes straight to the first set when there is no lead-in", () => {
    expect(setRunPhase(startSetRun({ ...PULLUPS, leadInSeconds: 0 }))).toBe("set");
  });

  it("counts the lead-in down and then starts the set", () => {
    let state = startSetRun(PULLUPS);
    state = tickSetRun(state, 4 * SEC);
    expect(setRunPhase(state)).toBe("leadIn");
    expect(state.leadInRemainingMs).toBe(6 * SEC);

    state = tickSetRun(state, 6 * SEC);
    expect(setRunPhase(state)).toBe("set");
  });

  it("carries time past the end of the lead-in into the set, not into a rest", () => {
    const state = tickSetRun(startSetRun(PULLUPS), 15 * SEC);
    expect(state.leadInRemainingMs).toBe(0);
    expect(state.sinceLastSetMs).toBe(5 * SEC);
    // Still set 1 - nothing has been rested from yet.
    expect(isResting(state)).toBe(false);
  });

  it("can skip the lead-in", () => {
    const state = skipLeadIn(startSetRun(PULLUPS));
    expect(setRunPhase(state)).toBe("set");
    expect(state.leadInRemainingMs).toBe(0);
  });
});

describe("finishing sets", () => {
  it("records the reps and moves to the next set", () => {
    const state = finishSet(skipLeadIn(startSetRun(PULLUPS)), PULLUPS, 6);
    expect(state.completed).toEqual([6]);
    expect(state.currentSet).toBe(2);
    expect(state.done).toBe(false);
  });

  it("restarts the rest clock from the moment the set ended", () => {
    let state = tickSetRun(skipLeadIn(startSetRun(PULLUPS)), 45 * SEC);
    state = finishSet(state, PULLUPS, 6);
    expect(state.sinceLastSetMs).toBe(0);
  });

  it("records what was actually managed, set by set", () => {
    const state = runSets(PULLUPS, 4, [10, 7, 8, 8]);
    expect(state.completed).toEqual([10, 7, 8, 8]);
  });

  it("is done after the last set", () => {
    const state = runSets(PULLUPS, 4);
    expect(state.done).toBe(true);
    expect(setRunPhase(state)).toBe("done");
  });

  it("ignores further finishes once done", () => {
    const done = runSets(PULLUPS, 4);
    expect(finishSet(done, PULLUPS, 6)).toBe(done);
  });

  it("falls back to the planned reps for a nonsense count", () => {
    const state = skipLeadIn(startSetRun(PULLUPS));
    expect(finishSet(state, PULLUPS, 0).completed).toEqual([6]);
    expect(finishSet(state, PULLUPS, NaN).completed).toEqual([6]);
    expect(finishSet(state, PULLUPS, -3).completed).toEqual([6]);
  });

  it("rounds a fractional count", () => {
    expect(finishSet(skipLeadIn(startSetRun(PULLUPS)), PULLUPS, 6.6).completed).toEqual([7]);
  });

  it("finishing during the lead-in skips the rest of it", () => {
    const state = finishSet(startSetRun(PULLUPS), PULLUPS, 6);
    expect(state.leadInRemainingMs).toBe(0);
    expect(setRunPhase(state)).toBe("set");
  });

  it("undoes the last set", () => {
    let state = runSets(PULLUPS, 2, [10, 7]);
    state = undoLastSet(state);
    expect(state.completed).toEqual([10]);
    expect(state.currentSet).toBe(2);
    expect(state.done).toBe(false);
  });

  it("undo re-opens a finished run", () => {
    const state = undoLastSet(runSets(PULLUPS, 4));
    expect(state.done).toBe(false);
    expect(state.currentSet).toBe(4);
  });

  it("undo does nothing before the first set", () => {
    const state = skipLeadIn(startSetRun(PULLUPS));
    expect(undoLastSet(state)).toBe(state);
  });
});

describe("the rest clock", () => {
  it("is not a rest before the first set", () => {
    const state = tickSetRun(skipLeadIn(startSetRun(PULLUPS)), 60 * SEC);
    expect(isResting(state)).toBe(false);
  });

  it("counts down from the target after a set", () => {
    let state = finishSet(skipLeadIn(startSetRun(PULLUPS)), PULLUPS, 6);
    expect(isResting(state)).toBe(true);
    expect(restRemainingSeconds(state, PULLUPS)).toBe(180);

    state = tickSetRun(state, 60 * SEC);
    expect(restRemainingSeconds(state, PULLUPS)).toBe(120);
  });

  it("goes negative rather than stopping at zero", () => {
    let state = finishSet(skipLeadIn(startSetRun(PULLUPS)), PULLUPS, 6);
    state = tickSetRun(state, 200 * SEC);
    expect(restRemainingSeconds(state, PULLUPS)).toBe(-20);
  });

  it("reports the target as passed only while actually resting", () => {
    let state = skipLeadIn(startSetRun(PULLUPS));
    state = tickSetRun(state, 300 * SEC);
    expect(hasRestElapsed(state, PULLUPS)).toBe(false); // before the first set

    state = finishSet(state, PULLUPS, 6);
    expect(hasRestElapsed(state, PULLUPS)).toBe(false);
    state = tickSetRun(state, 181 * SEC);
    expect(hasRestElapsed(state, PULLUPS)).toBe(true);
  });

  it("stops being a rest once the run is done", () => {
    const state = runSets(PULLUPS, 4);
    expect(isResting(state)).toBe(false);
    expect(hasRestElapsed(state, PULLUPS)).toBe(false);
  });

  it("ignores a zero or negative tick", () => {
    const state = skipLeadIn(startSetRun(PULLUPS));
    expect(tickSetRun(state, 0)).toBe(state);
    expect(tickSetRun(state, -100)).toBe(state);
  });
});

describe("progress", () => {
  it("counts sets and total reps as they are finished", () => {
    expect(setRunProgress(runSets(PULLUPS, 2, [10, 7]), PULLUPS)).toMatchObject({
      setsCompleted: 2, totalSets: 4, repsCompleted: 17, currentSet: 3,
    });
  });

  it("never reports a current set past the plan", () => {
    expect(setRunProgress(runSets(PULLUPS, 4), PULLUPS).currentSet).toBe(4);
  });
});

describe("what a run logs", () => {
  it("writes a per-set array when the sets differed", () => {
    expect(setRunLoggedValues(PULLUPS, runSets(PULLUPS, 4, [10, 7, 8, 8]))).toEqual({
      sets: 4, reps: [10, 7, 8, 8], timeBetweenSets: 180,
    });
  });

  it("collapses to a single number when every set matched", () => {
    // No point storing [6, 6, 6, 6] when 6 says the same thing.
    expect(setRunLoggedValues(PULLUPS, runSets(PULLUPS, 4, [6, 6, 6, 6]))).toEqual({
      sets: 4, reps: 6, timeBetweenSets: 180,
    });
  });

  it("reports the sets actually done, not the sets planned", () => {
    expect(setRunLoggedValues(PULLUPS, runSets(PULLUPS, 2, [6, 5]))).toMatchObject({ sets: 2, reps: [6, 5] });
  });

  it("logs something sane for a run stopped before any set finished", () => {
    const values = setRunLoggedValues(PULLUPS, skipLeadIn(startSetRun(PULLUPS)));
    expect(values.sets).toBe(1);
    expect(values.reps).toBe(6);
  });
});

describe("choosing the timing model", () => {
  it("self-paces an exercise with no per-rep duration", () => {
    // weighted-pullups: sets/reps/timeOff, no timeOn.
    expect(isSelfPaced({ sets: 4, reps: 6, timeOff: 180 })).toBe(true);
  });

  it("counts down an exercise that has one", () => {
    // max-hangs: a 7-second hang is 7 seconds whether the user likes it or not.
    expect(isSelfPaced({ sets: 5, reps: 6, timeOn: 7, timeOff: 3, timeBetweenSets: 180 })).toBe(false);
  });

  it("self-paces an exercise that says nothing at all", () => {
    expect(isSelfPaced({})).toBe(true);
    expect(isSelfPaced(undefined)).toBe(true);
  });

  it("ignores a zero or nonsense timeOn", () => {
    expect(isSelfPaced({ timeOn: 0 })).toBe(true);
    expect(isSelfPaced({ timeOn: NaN })).toBe(true);
  });

  it("lets an explicit mode override the data either way", () => {
    expect(isSelfPaced({ timeOn: 7 }, "selfPaced")).toBe(true);
    expect(isSelfPaced({ sets: 4, timeOff: 180 }, "timed")).toBe(false);
  });
});

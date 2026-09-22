import { describe, it, expect } from "vitest";
import {
  DEFAULT_SPEC,
  clampSpec,
  specFromExercise,
  hasIntervalTiming,
  buildTimeline,
  timelineSeconds,
  positionAt,
  stepStartSeconds,
  skipToNextSeconds,
  backSeconds,
  progressAt,
  loggedValuesFor,
  specsDiffer,
  workPhaseLabel,
  phaseLabel,
  type IntervalSpec,
} from "./intervalTimer";

/** A 2x3 repeater: 5s on, 2s off, 10s between sets, no lead-in. */
const SMALL: IntervalSpec = {
  sets: 2,
  reps: 3,
  workSeconds: 5,
  restSeconds: 2,
  setRestSeconds: 10,
  leadInSeconds: 0,
};

describe("buildTimeline", () => {
  it("lays out sets, reps and rests in order", () => {
    expect(buildTimeline(SMALL).map((s) => `${s.phase}${s.set}.${s.rep}`)).toEqual([
      "work1.1", "rest1.1",
      "work1.2", "rest1.2",
      "work1.3",
      "setRest1.0",
      "work2.1", "rest2.1",
      "work2.2", "rest2.2",
      "work2.3",
    ]);
  });

  it("drops the rest after the last rep of a set", () => {
    const timeline = buildTimeline(SMALL);
    const firstSetRestIndex = timeline.findIndex((s) => s.phase === "setRest");
    expect(timeline[firstSetRestIndex - 1].phase).toBe("work");
  });

  it("drops the set rest after the last set, so the run ends on work", () => {
    const timeline = buildTimeline(SMALL);
    expect(timeline.at(-1)!.phase).toBe("work");
    expect(timeline.filter((s) => s.phase === "setRest")).toHaveLength(1);
  });

  it("includes a lead-in only when there is one", () => {
    expect(buildTimeline(SMALL)[0].phase).toBe("work");
    expect(buildTimeline({ ...SMALL, leadInSeconds: 10 })[0]).toEqual({
      phase: "leadIn", seconds: 10, set: 0, rep: 0,
    });
  });

  it("omits within-set rests entirely when the rest is zero", () => {
    const timeline = buildTimeline({ ...SMALL, restSeconds: 0 });
    expect(timeline.some((s) => s.phase === "rest")).toBe(false);
    expect(timeline.filter((s) => s.phase === "work")).toHaveLength(6);
  });

  it("omits set rests entirely when the set rest is zero", () => {
    const timeline = buildTimeline({ ...SMALL, setRestSeconds: 0 });
    expect(timeline.some((s) => s.phase === "setRest")).toBe(false);
  });

  it("handles a single set of a single rep", () => {
    const timeline = buildTimeline({ ...SMALL, sets: 1, reps: 1 });
    expect(timeline).toEqual([{ phase: "work", seconds: 5, set: 1, rep: 1 }]);
  });

  it("totals the run correctly", () => {
    // 6 work x 5s = 30, 4 within-set rests x 2s = 8, 1 set rest x 10s = 10
    expect(timelineSeconds(buildTimeline(SMALL))).toBe(48);
  });

  it("matches a real 5x6 hangboard repeater", () => {
    const spec: IntervalSpec = { sets: 5, reps: 6, workSeconds: 7, restSeconds: 3, setRestSeconds: 180, leadInSeconds: 0 };
    // per set: 6x7 + 5x3 = 57s; 5 sets = 285s; 4 set rests = 720s
    expect(timelineSeconds(buildTimeline(spec))).toBe(285 + 720);
  });
});

describe("positionAt", () => {
  const timeline = buildTimeline(SMALL);

  it("starts on the first step", () => {
    const p = positionAt(timeline, 0);
    expect(p.index).toBe(0);
    expect(p.step!.phase).toBe("work");
    expect(p.remaining).toBe(5);
    expect(p.done).toBe(false);
  });

  it("counts down within a step", () => {
    expect(positionAt(timeline, 1).remaining).toBe(4);
    expect(positionAt(timeline, 4.5).remaining).toBe(1);
  });

  it("moves to the next step exactly at the boundary", () => {
    expect(positionAt(timeline, 4.999).step!.phase).toBe("work");
    expect(positionAt(timeline, 5).step!.phase).toBe("rest");
  });

  it("finds the set rest at the right moment", () => {
    // work5 rest2 work5 rest2 work5 = 19s, then the set rest
    expect(positionAt(timeline, 19).step!.phase).toBe("setRest");
    expect(positionAt(timeline, 28.5).step!.phase).toBe("setRest");
    expect(positionAt(timeline, 29).step!.phase).toBe("work");
    expect(positionAt(timeline, 29).step!.set).toBe(2);
  });

  it("reports done past the end", () => {
    const total = timelineSeconds(timeline);
    expect(positionAt(timeline, total).done).toBe(true);
    expect(positionAt(timeline, total + 100).done).toBe(true);
    expect(positionAt(timeline, total).step).toBeNull();
  });

  it("treats negative elapsed as the start rather than running backwards", () => {
    expect(positionAt(timeline, -5).index).toBe(0);
  });

  it("reports done immediately for an empty timeline", () => {
    expect(positionAt([], 0).done).toBe(true);
  });
});

describe("seeking", () => {
  const timeline = buildTimeline(SMALL);

  it("reports where each step begins", () => {
    expect(stepStartSeconds(timeline, 0)).toBe(0);
    expect(stepStartSeconds(timeline, 1)).toBe(5);
    expect(stepStartSeconds(timeline, 2)).toBe(7);
    expect(stepStartSeconds(timeline, timeline.length)).toBe(timelineSeconds(timeline));
  });

  it("clamps an out-of-range index instead of returning NaN", () => {
    expect(stepStartSeconds(timeline, -3)).toBe(0);
    expect(stepStartSeconds(timeline, 999)).toBe(timelineSeconds(timeline));
  });

  it("skips to the start of the next step", () => {
    expect(skipToNextSeconds(timeline, 0)).toBe(5);
    expect(skipToNextSeconds(timeline, 3)).toBe(5);
    expect(skipToNextSeconds(timeline, 6)).toBe(7);
  });

  it("skipping from the last step ends the run", () => {
    const total = timelineSeconds(timeline);
    expect(skipToNextSeconds(timeline, total - 1)).toBe(total);
    expect(skipToNextSeconds(timeline, total + 5)).toBe(total);
  });

  it("back restarts the current step when you are well into it", () => {
    // 10s is 3s into the work step that runs 7s-12s.
    expect(backSeconds(timeline, 10)).toBe(7);
  });

  it("back goes to the previous step when you have only just started this one", () => {
    expect(backSeconds(timeline, 5.5)).toBe(0);
  });

  it("back from the very start stays at zero", () => {
    expect(backSeconds(timeline, 0)).toBe(0);
    expect(backSeconds(timeline, 1)).toBe(0);
  });
});

describe("progressAt", () => {
  const timeline = buildTimeline(SMALL);

  it("counts nothing done at the start", () => {
    expect(progressAt(timeline, SMALL, 0)).toMatchObject({
      setsCompleted: 0, repsCompletedInSet: 0, repsCompleted: 0, currentSet: 1, currentRep: 1,
    });
  });

  it("does not count a rep until its work phase is over", () => {
    expect(progressAt(timeline, SMALL, 4.9).repsCompleted).toBe(0);
    expect(progressAt(timeline, SMALL, 5).repsCompleted).toBe(1);
  });

  it("counts a full set once its last rep is done", () => {
    // first set's last work ends at 19s
    expect(progressAt(timeline, SMALL, 19)).toMatchObject({ setsCompleted: 1, repsCompletedInSet: 0, repsCompleted: 3 });
  });

  it("tracks partial progress through the second set", () => {
    expect(progressAt(timeline, SMALL, 34)).toMatchObject({ setsCompleted: 1, repsCompletedInSet: 1, currentSet: 2 });
  });

  it("reports everything done at the end", () => {
    expect(progressAt(timeline, SMALL, timelineSeconds(timeline))).toMatchObject({
      setsCompleted: 2, repsCompleted: 6,
    });
  });

  it("does not count the lead-in as work", () => {
    const withLead = { ...SMALL, leadInSeconds: 10 };
    const t = buildTimeline(withLead);
    expect(progressAt(t, withLead, 9).repsCompleted).toBe(0);
    expect(progressAt(t, withLead, 10).repsCompleted).toBe(0);
    expect(progressAt(t, withLead, 15).repsCompleted).toBe(1);
  });
});

describe("loggedValuesFor", () => {
  const timeline = buildTimeline(SMALL);

  it("logs the full protocol when it ran to the end", () => {
    const progress = progressAt(timeline, SMALL, timelineSeconds(timeline));
    expect(loggedValuesFor(SMALL, progress)).toEqual({
      sets: 2, reps: 3, timeOn: 5, timeOff: 2, timeBetweenSets: 10,
    });
  });

  it("logs whole sets when stopped exactly between them", () => {
    const progress = progressAt(timeline, SMALL, 19);
    expect(loggedValuesFor(SMALL, progress)).toMatchObject({ sets: 1, reps: 3 });
  });

  it("counts a partial set as a set, with the reps actually done", () => {
    const progress = progressAt(timeline, SMALL, 34); // 1 full set + 1 rep
    expect(loggedValuesFor(SMALL, progress)).toMatchObject({ sets: 2, reps: 1 });
  });

  it("never logs zero sets for a run that barely started", () => {
    const progress = progressAt(timeline, SMALL, 1);
    expect(loggedValuesFor(SMALL, progress).sets).toBe(1);
  });
});

describe("specFromExercise", () => {
  it("takes every field the exercise provides", () => {
    expect(specFromExercise({ sets: 4, reps: 5, timeOn: 10, timeOff: 5, timeBetweenSets: 120 })).toEqual({
      sets: 4, reps: 5, workSeconds: 10, restSeconds: 5, setRestSeconds: 120, leadInSeconds: DEFAULT_SPEC.leadInSeconds,
    });
  });

  it("falls back per field rather than discarding a partial exercise", () => {
    const spec = specFromExercise({ sets: 4, reps: 5 });
    expect(spec.sets).toBe(4);
    expect(spec.reps).toBe(5);
    expect(spec.workSeconds).toBe(DEFAULT_SPEC.workSeconds);
    expect(spec.setRestSeconds).toBe(DEFAULT_SPEC.setRestSeconds);
  });

  it("never reads the lead-in from the exercise", () => {
    expect(specFromExercise({ duration: 30 }).leadInSeconds).toBe(DEFAULT_SPEC.leadInSeconds);
  });

  it("falls back for an undefined or empty exercise", () => {
    expect(specFromExercise(undefined)).toEqual(DEFAULT_SPEC);
    expect(specFromExercise({})).toEqual(DEFAULT_SPEC);
  });

  it("ignores zero and nonsense values", () => {
    const spec = specFromExercise({ sets: 0, reps: -2, timeOn: NaN });
    expect(spec.sets).toBe(DEFAULT_SPEC.sets);
    expect(spec.reps).toBe(DEFAULT_SPEC.reps);
    expect(spec.workSeconds).toBe(DEFAULT_SPEC.workSeconds);
  });
});

describe("clampSpec", () => {
  it("keeps work at a second or more, so a timeline is never all rest", () => {
    expect(clampSpec({ ...SMALL, workSeconds: 0 }).workSeconds).toBe(1);
  });

  it("allows zero rests", () => {
    const spec = clampSpec({ ...SMALL, restSeconds: 0, setRestSeconds: 0, leadInSeconds: 0 });
    expect(spec.restSeconds).toBe(0);
    expect(spec.setRestSeconds).toBe(0);
    expect(spec.leadInSeconds).toBe(0);
  });

  it("keeps at least one set and one rep", () => {
    expect(clampSpec({ ...SMALL, sets: 0, reps: 0 })).toMatchObject({ sets: 1, reps: 1 });
  });

  it("rounds fractions and rejects non-numbers", () => {
    expect(clampSpec({ ...SMALL, sets: 3.6 }).sets).toBe(4);
    expect(clampSpec({ ...SMALL, reps: NaN }).reps).toBe(DEFAULT_SPEC.reps);
  });
});

describe("hasIntervalTiming", () => {
  it("is true when the exercise carries any interval number", () => {
    expect(hasIntervalTiming({ timeOn: 7 })).toBe(true);
    expect(hasIntervalTiming({ sets: 3 })).toBe(true);
  });

  it("is false for an exercise with nothing to run", () => {
    expect(hasIntervalTiming({})).toBe(false);
    expect(hasIntervalTiming(undefined)).toBe(false);
    expect(hasIntervalTiming({ duration: 45, minGrade: "6A" })).toBe(false);
  });
});

describe("specsDiffer", () => {
  it("is false for the same spec", () => {
    expect(specsDiffer(SMALL, { ...SMALL })).toBe(false);
  });

  it("is true for any changed field", () => {
    expect(specsDiffer(SMALL, { ...SMALL, sets: 3 })).toBe(true);
    expect(specsDiffer(SMALL, { ...SMALL, leadInSeconds: 5 })).toBe(true);
  });

  it("compares clamped values, so a no-op edit is not an edit", () => {
    expect(specsDiffer(SMALL, { ...SMALL, sets: 2.4 })).toBe(false);
  });
});

describe("labels", () => {
  it("says Hang for hangboard-ish exercises", () => {
    expect(workPhaseLabel(["holdType", "sets"])).toBe("Hang");
    expect(workPhaseLabel(["holdSize"])).toBe("Hang");
  });

  it("says Work otherwise", () => {
    expect(workPhaseLabel(["sets", "reps", "weight"])).toBe("Work");
    expect(workPhaseLabel(undefined)).toBe("Work");
  });

  it("names each phase", () => {
    expect(phaseLabel("leadIn")).toBe("Get ready");
    expect(phaseLabel("work", "Hang")).toBe("Hang");
    expect(phaseLabel("rest")).toBe("Rest");
    expect(phaseLabel("setRest")).toBe("Set rest");
  });
});

import { describe, expect, it } from "vitest";
import type { ExerciseGroup, ExerciseSlot, Workout } from "../types";
import {
  COUNTED_SECONDS_PER_REP,
  groupMemberMinutes,
  groupMinutes,
  groupSlots,
  groupTiming,
  memberRounds,
  memberSetSeconds,
  normaliseGroups,
  restComparison,
  ungroup,
  workoutItems,
  takeOutOfGroup,
  addToGroup,
  settleAfterMove,
  formatSeconds,
  groupSummary,
} from "./groups";
import { estimateSessionDuration, sessionDuration } from "../planning/sessionDuration";
import { workoutActualLoad, workoutPlannedLoad, calculatePlannedLoad } from "../analytics/load";

const slot = (id: string, prescribed: ExerciseSlot["prescribed"], extra: Partial<ExerciseSlot> = {}): ExerciseSlot => ({
  id,
  typeId: "t",
  prescribed,
  ...extra,
});

// A core circuit: 1 min each, 15 s transitions, 1 min after each round.
const core: ExerciseGroup = { id: "g", name: "Core", rounds: 3, transition: 15, roundRest: 60 };
const coreSlots = [
  slot("twist", { timeOn: 60 }, { groupId: "g" }),
  slot("plank", { timeOn: 60 }, { groupId: "g" }),
  slot("kicks", { timeOn: 60 }, { groupId: "g" }),
];
const members = (slots: ExerciseSlot[]) => slots.map((s) => ({ slot: s, values: s.prescribed! }));

describe("normaliseGroups", () => {
  it("returns the same object when nothing needs fixing", () => {
    const w = { exercises: coreSlots, groups: [core] };
    expect(normaliseGroups(w)).toBe(w);
    const plain = { exercises: [slot("a", {})] };
    expect(normaliseGroups(plain)).toBe(plain);
  });

  it("ungroups a slot whose group is missing", () => {
    const out = normaliseGroups({ exercises: coreSlots, groups: [] });
    expect(out.exercises.every((s) => s.groupId === undefined)).toBe(true);
    expect(out.groups).toBeUndefined();
  });

  it("keeps only the first run of a group that got split", () => {
    const out = normaliseGroups({
      exercises: [coreSlots[0], slot("x", {}), coreSlots[1], coreSlots[2]],
      groups: [core],
    });
    expect(out.exercises.map((s) => s.groupId)).toEqual(["g", undefined, undefined, undefined]);
  });

  it("drops groups without members and repairs rounds", () => {
    const out = normaliseGroups({
      exercises: coreSlots,
      groups: [{ ...core, rounds: 0 }, { id: "empty", rounds: 2 }],
    });
    expect(out.groups).toEqual([{ ...core, rounds: 1 }]);
  });
});

describe("workoutItems", () => {
  it("gathers members under their group, in order", () => {
    const items = workoutItems({ exercises: [slot("a", {}), ...coreSlots, slot("b", {})], groups: [core] });
    expect(items.map((i) => (i.kind === "slot" ? i.slot.id : `[${i.members.map((m) => m.slot.id).join(",")}]`))).toEqual([
      "a",
      "[twist,plank,kicks]",
      "b",
    ]);
  });
});

describe("timing", () => {
  it("adds up a circuit: work, transitions inside rounds, round rest between them", () => {
    // 3 rounds x (3 x 60 + 2 x 15) + 2 x 60 = 630 + 120 = 750 s
    expect(groupTiming(core, members(coreSlots)).totalSeconds).toBe(750);
    expect(groupMinutes({ exercises: coreSlots, groups: [core] }, "planned").get("g")).toBe(12.5);
  });

  it("falls back to the transition between rounds when there is no round rest", () => {
    const g = { ...core, roundRest: undefined };
    // 3 x 210 + 2 x 15
    expect(groupTiming(g, members(coreSlots)).totalSeconds).toBe(660);
  });

  it("drops a member out after its sets", () => {
    const slots = [slot("lever", { sets: 5, timeOn: 10 }, { groupId: "g" }), slot("core", { sets: 3, reps: 10 }, { groupId: "g" })];
    const g: ExerciseGroup = { id: "g", rounds: 5, transition: 0, roundRest: 0 };
    const timing = groupTiming(g, members(slots));
    expect(timing.rounds).toBe(5);
    expect(timing.roundMembers).toEqual([[0, 1], [0, 1], [0, 1], [0], [0]]);
    expect(timing.totalSeconds).toBe(5 * 10 + 3 * 10 * COUNTED_SECONDS_PER_REP);
  });

  it("never runs a member for more rounds than the group has", () => {
    expect(memberRounds({ sets: 8 }, core)).toBe(3);
    expect(memberRounds({ reps: [10, 8] }, core)).toBe(2);
    expect(memberRounds({}, core)).toBe(3);
  });

  it("times one set of a hang protocol with its rests between reps, never its set rest", () => {
    // 6 x 7 s on, 3 s off = 42 + 15; the 180 s between sets is the group's business
    expect(memberSetSeconds({ reps: 6, timeOn: 7, timeOff: 3, timeBetweenSets: 180 }, core, 0)).toBe(57);
  });

  it("reads a per-round reps array for counted sets", () => {
    expect(memberSetSeconds({ reps: [12, 9] }, core, 1)).toBe(9 * COUNTED_SECONDS_PER_REP);
  });
});

describe("restComparison", () => {
  it("shows what a superset member really rests against what it wanted", () => {
    // Pull-ups want 3:00 between sets. In the superset they get: wrist curls
    // (15 x 3 = 45 s) + CARs (45 s) + 2 transitions of 15 s + 60 s round rest
    // + 0 before them in round 2 = 180 s.
    const slots = [
      slot("pull", { sets: 4, reps: 6, timeOff: 180 }, { groupId: "s" }),
      slot("curl", { reps: 15 }, { groupId: "s" }),
      slot("cars", { timeOn: 45 }, { groupId: "s" }),
    ];
    const g: ExerciseGroup = { id: "s", rounds: 4, transition: 15, roundRest: 60 };
    expect(restComparison(g, members(slots))).toEqual([{ slotId: "pull", wanted: 180, gets: 180 }]);
  });

  it("is empty for a single round", () => {
    expect(restComparison({ ...core, rounds: 1 }, members([slot("p", { timeOff: 120 })]))).toEqual([]);
  });
});

describe("duration and load count a group once", () => {
  const workout = (extra: Partial<Workout> = {}): Workout => ({
    id: "w",
    status: "planned",
    date: null,
    weekId: "2026-W40",
    loadFactor: 0,
    exercises: [slot("warm", { duration: 10 }), ...coreSlots],
    groups: [core],
    ...extra,
  });

  it("estimates the session as its lone exercises plus each group rounded up", () => {
    expect(estimateSessionDuration(workout())).toBe(10 + 13);
  });

  it("leaves skipped members out of the actual duration", () => {
    const w = workout({
      status: "completed",
      exercises: [slot("warm", { duration: 10 }), coreSlots[0], { ...coreSlots[1], skipped: true }, coreSlots[2]],
    });
    // 3 x (120 + 15) + 2 x 60 = 525 s -> 9 min
    expect(sessionDuration(w)).toBe(10 + 9);
  });

  it("times members by their share of the group, rests included", () => {
    const shares = groupMemberMinutes(workout(), "planned");
    expect(shares.get("twist")).toBeCloseTo(12.5 / 3);
    const load = workoutPlannedLoad(workout().exercises, workout().groups);
    expect(load).toBe(
      calculatePlannedLoad({ duration: 10 }) + 3 * calculatePlannedLoad({ duration: 12.5 / 3 }),
    );
    // Without the group each is its own 1-minute set - the circuit's rests go uncounted.
    expect(workoutPlannedLoad(workout().exercises)).toBe(
      calculatePlannedLoad({ duration: 10 }) + 3 * calculatePlannedLoad({ duration: 1 }),
    );
  });

  it("gives a skipped member no actual load", () => {
    const exercises = [coreSlots[0], { ...coreSlots[1], skipped: true as const }, coreSlots[2]];
    const shares = groupMemberMinutes({ exercises, groups: [core] }, "actual");
    expect(shares.has("plank")).toBe(false);
    expect(workoutActualLoad(exercises, [core])).toBe(2 * calculatePlannedLoad({ duration: shares.get("twist")! }));
  });
});

describe("editing", () => {
  it("groups slots at the first one's position, pulling later ones up", () => {
    const w: { exercises: ExerciseSlot[]; groups?: ExerciseGroup[] } = { exercises: [slot("a", {}), slot("b", {}), slot("c", {}), slot("d", {})] };
    const out = groupSlots(w, ["b", "d"], { id: "g", rounds: 2 });
    expect(out.exercises.map((s) => `${s.id}${s.groupId ? "*" : ""}`)).toEqual(["a", "b*", "d*", "c"]);
    expect(out.groups).toEqual([{ id: "g", rounds: 2 }]);
  });

  it("ungroups in place", () => {
    const out = ungroup({ exercises: coreSlots, groups: [core] }, "g");
    expect(out.exercises.map((s) => s.id)).toEqual(["twist", "plank", "kicks"]);
    expect(out.exercises.some((s) => s.groupId)).toBe(false);
    expect(out.groups).toBeUndefined();
  });
});

describe("moving members", () => {
  const w = () => ({ exercises: [...coreSlots, slot("x", {})], groups: [core] });

  it("takes a member out to just after the group", () => {
    const out = takeOutOfGroup(w(), "twist");
    expect(out.exercises.map((s) => `${s.id}${s.groupId ? "*" : ""}`)).toEqual(["plank*", "kicks*", "twist", "x"]);
  });

  it("adds a member at the end of the group", () => {
    const out = addToGroup(w(), "g", slot("new", {}));
    expect(out.exercises.map((s) => `${s.id}${s.groupId ? "*" : ""}`)).toEqual(["twist*", "plank*", "kicks*", "new*", "x"]);
  });

  it("lets a dropped exercise join the group it lands inside", () => {
    const moved = [coreSlots[0], slot("x", {}), coreSlots[1], coreSlots[2]];
    expect(settleAfterMove(moved).map((s) => s.groupId)).toEqual(["g", "g", "g", "g"]);
    // at the edge it stays out
    expect(settleAfterMove([slot("x", {}), ...coreSlots])[0].groupId).toBeUndefined();
  });
});

describe("display", () => {
  it("formats rests and sums a group up", () => {
    expect(formatSeconds(15)).toBe("15 s");
    expect(formatSeconds(90)).toBe("1:30");
    expect(groupSummary(core)).toBe("3 rounds · 15 s between · 1:00 after each round");
    expect(groupSummary({ id: "x", rounds: 1, roundRest: 60 })).toBe("1 round");
  });
});

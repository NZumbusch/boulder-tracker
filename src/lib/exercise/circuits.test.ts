import { describe, expect, it } from "vitest";
import type { Circuit, ExerciseGroup, ExerciseSlot } from "../types";
import { circuitAsWorkout, circuitFromGroup, insertCircuit } from "./circuits";
import { groupMinutes, workoutItems } from "./groups";

let n = 0;
const id = () => `n${++n}`;

const group: ExerciseGroup = { id: "g", name: "Core A", rounds: 3, transition: 15, roundRest: 60 };
const workout = {
  exercises: [
    { id: "warm", typeId: "mob", prescribed: { duration: 10 } },
    { id: "a", typeId: "core", prescribed: { timeOn: 60 }, logged: { timeOn: 50 }, groupId: "g" },
    { id: "b", typeId: "push", logged: { reps: [12, 10, 9] }, skipped: true as const, groupId: "g" },
  ] as ExerciseSlot[],
  groups: [group],
};

describe("circuitFromGroup", () => {
  it("copies the group's timing and its members' plans, without logs, skips or grouping", () => {
    const c = circuitFromGroup(workout, "g", { id: "c1" }, id)!;
    expect(c).toMatchObject({ id: "c1", name: "Core A", rounds: 3, transition: 15, roundRest: 60 });
    expect(c.exercises.map((e) => [e.typeId, e.prescribed, e.logged, e.groupId, e.skipped])).toEqual([
      ["core", { timeOn: 60 }, undefined, undefined, undefined],
      ["push", { reps: [12, 10, 9] }, undefined, undefined, undefined],
    ]);
    expect(c.exercises.map((e) => e.id)).not.toContain("a");
  });

  it("keeps an existing circuit's id and description when updating, and names unnamed groups", () => {
    const c = circuitFromGroup({ ...workout, groups: [{ ...group, name: undefined }] }, "g", { id: "old", description: "Slow" }, id)!;
    expect(c).toMatchObject({ id: "old", name: "Circuit", description: "Slow" });
  });

  it("is undefined for a group that isn't there", () => {
    expect(circuitFromGroup(workout, "nope", { id: "x" }, id)).toBeUndefined();
  });
});

describe("insertCircuit", () => {
  const circuit: Circuit = {
    id: "c1", name: "Core A", rounds: 3, transition: 15, roundRest: 60,
    exercises: [{ id: "s1", typeId: "core", prescribed: { timeOn: 60 } }, { id: "s2", typeId: "push", prescribed: { reps: 12 } }],
  };

  it("adds a copy as its own group at the end, remembering where it came from", () => {
    const out = insertCircuit({ exercises: [workout.exercises[0]] }, circuit, id);
    const items = workoutItems(out);
    expect(items).toHaveLength(2);
    const added = items[1];
    expect(added.kind).toBe("group");
    if (added.kind !== "group") return;
    expect(added.group).toMatchObject({ name: "Core A", rounds: 3, transition: 15, roundRest: 60, circuitId: "c1" });
    expect(added.members.map((m) => m.slot.typeId)).toEqual(["core", "push"]);
    expect(added.members.map((m) => m.slot.id)).not.toContain("s1");
  });

  it("never shares objects with the library", () => {
    const out = insertCircuit({ exercises: [] as ExerciseSlot[] }, circuit, id);
    out.exercises[0].prescribed!.timeOn = 5;
    expect(circuit.exercises[0].prescribed!.timeOn).toBe(60);
  });

  it("can drop its exercises into an existing group instead", () => {
    const out = insertCircuit(workout, circuit, id, "g");
    expect(out.groups).toHaveLength(1);
    expect(out.exercises.filter((e) => e.groupId === "g")).toHaveLength(4);
  });
});

describe("circuitAsWorkout", () => {
  it("lets the shared timing helpers read a circuit", () => {
    const c: Circuit = { id: "c", name: "x", rounds: 2, transition: 10, exercises: [{ id: "a", typeId: "t", prescribed: { timeOn: 30 } }] };
    // 2 x 30 s + 10 s between rounds (transition stands in for the round rest)
    expect(groupMinutes(circuitAsWorkout(c), "planned").get("circuit")).toBeCloseTo(70 / 60);
  });
});

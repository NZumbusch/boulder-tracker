import { describe, expect, it } from "vitest";
import type { Circuit, ExerciseSlot, ExerciseTypeDef } from "../types";
import { amountOf, amountText, blankCircuit, circuitLine, draftFromSaved, searchCircuits, slotForType, slotWithAmount, withAmount } from "./circuitDraft";

const type = (id: string, parameters: ExerciseTypeDef["parameters"]): ExerciseTypeDef => ({ id, name: id, category: "Strength" as never, parameters });
const nameOf = (s: ExerciseSlot) => s.typeId;

describe("amountOf / withAmount", () => {
  it("reads seconds from timeOn, else reps (first set of a per-set array), else the default", () => {
    expect(amountOf({ timeOn: 39 })).toEqual({ kind: "time", n: 39 });
    expect(amountOf({ reps: 3 })).toEqual({ kind: "reps", n: 3 });
    expect(amountOf({ reps: [10, 8] as never })).toEqual({ kind: "reps", n: 10 });
    expect(amountOf(undefined)).toEqual({ kind: "reps", n: 8 });
  });
  it("sets one amount and clears the other kind and sets", () => {
    expect(withAmount({ reps: 5, sets: 4, notes: "x" }, "time", 39)).toEqual({ notes: "x", timeOn: 39 });
    expect(withAmount({ timeOn: 30 }, "reps", 3)).toEqual({ reps: 3 });
    expect(withAmount({}, "reps", 0)).toEqual({ reps: 1 });
  });
});

describe("slotForType", () => {
  it("counted by default, timed for a duration-only exercise", () => {
    const pull = slotForType(type("pull", ["sets", "reps", "weight"]), "a");
    expect(pull.prescribed).toEqual({ reps: 8 });
    expect(pull.activeParameters).toEqual(["reps", "weight"]);
    const stretch = slotForType(type("stretch", ["duration"]), "b");
    expect(stretch.prescribed).toEqual({ timeOn: 30 });
    expect(stretch.activeParameters).toContain("timeOn");
  });
  it("switching the kind keeps the slot's tracked parameters in step", () => {
    const s = slotWithAmount(slotForType(type("face", ["reps"]), "a"), "time", 39);
    expect(s.prescribed).toEqual({ timeOn: 39 });
    expect(s.activeParameters).toEqual(["timeOn"]);
  });
});

describe("text and search", () => {
  const circuits: Circuit[] = [
    { id: "1", name: "Core A", rounds: 3, exercises: [{ id: "x", typeId: "plank", prescribed: { timeOn: 45 } }] },
    { id: "2", name: "Pull day", rounds: 6, description: "scapular work", exercises: [{ id: "y", typeId: "pullups", prescribed: { reps: 3 } }, { id: "z", typeId: "facepulls", prescribed: { timeOn: 39 } }] },
  ];
  it("describes a circuit in one line", () => {
    expect(amountText({ reps: 1 })).toBe("1 rep");
    expect(circuitLine(circuits[1], nameOf)).toBe("6 rounds: 3 reps pullups, 39 s facepulls");
  });
  it("finds circuits by name, exercise or note; a name start first; empty = all", () => {
    expect(searchCircuits(circuits, "", nameOf)).toHaveLength(2);
    expect(searchCircuits(circuits, "pull", nameOf).map((c) => c.id)).toEqual(["2"]);
    expect(searchCircuits(circuits, "plank", nameOf).map((c) => c.id)).toEqual(["1"]);
    expect(searchCircuits(circuits, "scapular", nameOf).map((c) => c.id)).toEqual(["2"]);
    expect(searchCircuits(circuits, "nothing", nameOf)).toEqual([]);
  });
  it("a draft from a saved circuit is a copy", () => {
    const d = draftFromSaved(circuits[1]);
    d.exercises[0].prescribed = { reps: 99 };
    expect(circuits[1].exercises[0].prescribed).toEqual({ reps: 3 });
  });
  it("a blank circuit has the usual rounds and rests", () => {
    expect(blankCircuit("n")).toEqual({ id: "n", name: "", rounds: 3, transition: 15, roundRest: 60, exercises: [] });
  });
});

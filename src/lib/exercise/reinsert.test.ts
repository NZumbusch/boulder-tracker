import { describe, it, expect } from "vitest";
import { reinsertSlot } from "./reinsert";
import type { ExerciseSlot, ExerciseGroup } from "../types";

const slot = (id: string, groupId?: string) => ({ id, typeId: "t", activeParameters: [], ...(groupId ? { groupId } : {}) }) as unknown as ExerciseSlot;
const group = (id: string) => ({ id, name: "C", rounds: 2, transition: 10, roundRest: 30 }) as ExerciseGroup;

describe("reinsertSlot", () => {
  it("puts the exercise back at its old place", () => {
    const out = reinsertSlot({ exercises: [slot("a"), slot("c")] }, slot("b"), 1);
    expect(out.exercises.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
  it("goes to the end when the list got shorter", () => {
    expect(reinsertSlot({ exercises: [slot("a")] }, slot("b"), 5).exercises.map((e) => e.id)).toEqual(["a", "b"]);
  });
  it("does nothing when it is already there", () => {
    const w = { exercises: [slot("a")] };
    expect(reinsertSlot(w, slot("a"), 0)).toBe(w);
  });
  it("brings back its circuit when the circuit is gone", () => {
    const w = { exercises: [slot("a"), slot("x", "g1")], groups: [group("g1")] };
    const out = reinsertSlot(w, slot("y", "g1"), 2, [group("g1")]);
    expect(out.exercises.map((e) => e.id)).toEqual(["a", "x", "y"]);
    expect(out.groups).toHaveLength(1);
    const alone = reinsertSlot<{ exercises: ExerciseSlot[]; groups?: ExerciseGroup[] }>({ exercises: [slot("a")] }, slot("y", "g1"), 1, [group("g1")]);
    expect(alone.groups?.map((g) => g.id)).toEqual(["g1"]);
    expect(alone.exercises[1].groupId).toBe("g1");
  });
});

import { reinsertById } from "./reinsert";
describe("reinsertById", () => {
  it("restores place, end, and no duplicate", () => {
    expect(reinsertById([{ id: "a" }, { id: "c" }], { id: "b" }, 1).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(reinsertById([{ id: "a" }], { id: "b" }, 9).map((x) => x.id)).toEqual(["a", "b"]);
    const l = [{ id: "a" }];
    expect(reinsertById(l, { id: "a" }, 0)).toBe(l);
  });
});

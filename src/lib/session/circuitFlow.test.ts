import { describe, expect, it } from "vitest";
import type { ExerciseSlot } from "../types";
import { pendingMembers, skipPlan } from "./circuitFlow";

const slot = (id: string, extra: Partial<ExerciseSlot> = {}): ExerciseSlot => ({ id, typeId: "t", ...extra });
const list = [
  slot("a", { groupId: "g" }),
  slot("b", { groupId: "g" }),
  slot("c", { groupId: "g", logged: { sets: 1 } }),
  slot("d", { groupId: "g", skipped: true }),
  slot("e"),
];

describe("pendingMembers", () => {
  it("is the members of the circuit still to do - not the logged or the skipped, not other exercises", () => {
    expect(pendingMembers(list, "g").map((s) => s.id)).toEqual(["a", "b"]);
    expect(pendingMembers(list, "other")).toEqual([]);
  });
});

describe("skipPlan", () => {
  it("asks when other members of the circuit are still to do", () => {
    const plan = skipPlan(list, "a");
    expect(plan.kind).toBe("ask");
    expect(plan.kind === "ask" && plan.others.map((s) => s.id)).toEqual(["b"]);
  });
  it("does not ask for an exercise outside a circuit, or the circuit's last one to do", () => {
    expect(skipPlan(list, "e")).toEqual({ kind: "direct" });
    const lastOne = list.map((s) => (s.id === "b" ? { ...s, skipped: true as const } : s));
    expect(skipPlan(lastOne, "a")).toEqual({ kind: "direct" });
    expect(skipPlan(list, "missing")).toEqual({ kind: "direct" });
  });
});

import { describe, it, expect } from "vitest";
import type { Benchmark, BenchmarkTypeDef, ValueDef } from "../types";
import { slotTypeName } from "../exerciseSlot";
import { isTestSlot, lastConditions, makeTestSlot, plannedConditionsText, resultForSlot, resultText, testResultId, testStatuses, TEST_SLOT_TYPE_ID } from "./testSlot";

const defs: ValueDef[] = [
  { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight" },
  { id: "edge", name: "Edge depth", unit: "mm", kind: "number", measure: "length" },
  { id: "time", name: "Time", unit: "s", kind: "number", measure: "time" },
];
const hang: BenchmarkTypeDef = {
  id: "hang",
  name: "Max Hang",
  unit: "kg",
  fields: [
    { valueId: "weight", role: "result", label: "Added weight" },
    { valueId: "edge", role: "condition" },
    { valueId: "time", role: "condition" },
  ],
};
const result = (id: string, date: string, over: Partial<Benchmark> = {}): Benchmark => ({
  id, typeId: "hang", type: "Max Hang", value: 50, unit: "kg", date, weekId: "2026-W30", values: { weight: 50, edge: 20, time: 7 }, ...over,
});

describe("test slots", () => {
  it("makes a slot that reads as 'Test: name' without being a library exercise", () => {
    const slot = makeTestSlot({ id: "s1", type: hang, conditions: { edge: 20, time: 7 } });
    expect(isTestSlot(slot)).toBe(true);
    expect(slot.typeId).toBe(TEST_SLOT_TYPE_ID);
    expect(slotTypeName(slot, [])).toBe("Test: Max Hang");
    expect(slot.prescribed?.duration).toBeGreaterThan(0);
    expect(makeTestSlot({ id: "s2", type: hang }).test?.conditions).toBeUndefined();
  });

  it("gives a slot's result a stable id and finds it again", () => {
    expect(testResultId("s1")).toBe("test-s1");
    const b = result("test-s1", "2026-10-01", { slotId: "s1" });
    expect(resultForSlot([result("x", "2026-09-01"), b], "s1")).toBe(b);
    expect(resultForSlot([], "s1")).toBeUndefined();
  });

  it("starts a new result from the last one's conditions", () => {
    const older = result("a", "2026-08-01", { values: { weight: 45, edge: 15, time: 7 } });
    const newer = result("b", "2026-09-01", { values: { weight: 50, edge: 20, time: 10 } });
    expect(lastConditions(hang, defs, [older, newer])).toEqual({ edge: 20, time: 10 });
    expect(lastConditions(hang, defs, [])).toEqual({});
  });

  it("writes the plan and the result in words", () => {
    const slot = makeTestSlot({ id: "s1", type: hang, conditions: { edge: 20, time: 7 } });
    expect(plannedConditionsText(slot, hang, defs, "kg")).toBe("Edge depth 20 mm · Time 7 s");
    expect(resultText(result("a", "2026-09-01", { value: 51.5 }), hang, defs, "kg")).toBe("51.5 kg · 20 mm · 7 s");
  });

  it("says what is due, and what is already planned", () => {
    const pull: BenchmarkTypeDef = { id: "pull", name: "Pull-ups", unit: "reps" };
    const archived: BenchmarkTypeDef = { id: "old", name: "Old", unit: "s", archived: true };
    const asOf = new Date(2026, 9, 11, 12);
    const st = testStatuses([hang, pull, archived], [result("a", "2026-08-01T10:00:00Z")], asOf, new Set(["pull"]));
    expect(st.map((s) => s.type.id)).toEqual(["hang", "pull"]);
    expect(st[0]).toMatchObject({ weeksSince: 10, due: true, scheduled: false });
    expect(st[1]).toMatchObject({ weeksSince: undefined, due: true, scheduled: true });
    expect(testStatuses([hang], [result("a", "2026-10-01T10:00:00Z")], asOf)[0].due).toBe(false);
  });
});

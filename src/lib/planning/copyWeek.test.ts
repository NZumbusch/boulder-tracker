import { describe, it, expect } from "vitest";
import type { Workout } from "../types";
import { copySessionsToWeek } from "./copyWeek";

const source: Workout[] = [
  {
    id: "w1", status: "completed", date: "2026-09-14T18:00:00.000Z", weekId: "2026-W38", dayOfWeek: "Monday", startTime: "18:00",
    notes: "Power", description: "Short and sharp", plannedDuration: 90, loadFactor: 900, fingers: 7, actualDuration: 95, blockId: "old",
    exercises: [
      { id: "s1", typeId: "hb", prescribed: { duration: 20, sets: 5 }, logged: { duration: 25, sets: 6 } },
      { id: "s2", typeId: "bo", logged: { duration: 40 } }, // an extra, done but never planned
      { id: "s3", typeId: "core", prescribed: { duration: 15 }, skipped: true },
    ],
  },
  { id: "w2", status: "planned", date: null, weekId: "2026-W38", dayOfWeek: "Thursday", notes: "Endurance", loadFactor: 0, exercises: [] },
];

describe("copySessionsToWeek", () => {
  const copies = copySessionsToWeek(source, "2026-W40", "new-block");

  it("makes a fresh planned session for each, in the target week", () => {
    expect(copies).toHaveLength(2);
    for (const c of copies) {
      expect(c).toMatchObject({ status: "planned", date: null, weekId: "2026-W40", blockId: "new-block", loadFactor: 0 });
      expect(source.map((s) => s.id)).not.toContain(c.id);
    }
    expect(copies.map((c) => [c.notes, c.dayOfWeek])).toEqual([["Power", "Monday"], ["Endurance", "Thursday"]]);
    expect(copies[0]).toMatchObject({ startTime: "18:00", description: "Short and sharp", plannedDuration: 90 });
  });

  it("copies the plan, not what happened", () => {
    const [power] = copies;
    expect(power).not.toHaveProperty("fingers");
    expect(power).not.toHaveProperty("actualDuration");
    expect(power.exercises.map((e) => e.prescribed)).toEqual([{ duration: 20, sets: 5 }, { duration: 40 }, { duration: 15 }]);
    for (const e of power.exercises) {
      expect(e).not.toHaveProperty("logged");
      expect(e).not.toHaveProperty("skipped");
      expect(["s1", "s2", "s3"]).not.toContain(e.id);
    }
    expect(power.plannedLoad).toBeGreaterThan(0);
  });
});

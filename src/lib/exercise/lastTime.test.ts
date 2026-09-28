import { describe, it, expect } from "vitest";
import type { Workout, ExerciseSlot } from "../types";
import { findLastLogged } from "./lastTime";

const w = (id: string, date: string | null, slots: Partial<ExerciseSlot>[], status: Workout["status"] = "completed"): Workout => ({
  id, date, status, weekId: "2026-W39", loadFactor: 0,
  exercises: slots.map((s, i) => ({ id: `${id}-${i}`, typeId: "pull", ...s })) as ExerciseSlot[],
});

describe("findLastLogged", () => {
  it("returns the most recent completed session's logged values", () => {
    const r = findLastLogged("pull", [
      w("a", "2026-09-10", [{ logged: { sets: 3, reps: 5, weight: 10 } }]),
      w("b", "2026-09-21", [{ logged: { sets: 3, reps: 5, weight: 12 } }]),
      w("c", "2026-09-15", [{ logged: { sets: 3, reps: 5, weight: 11 } }]),
    ]);
    expect(r).toEqual({ date: "2026-09-21", workoutId: "b", values: { sets: 3, reps: 5, weight: 12 } });
  });

  it("ignores planned sessions, skipped or unlogged slots, other types and the excluded session", () => {
    const r = findLastLogged("pull", [
      w("old", "2026-09-01", [{ logged: { weight: 8 } }]),
      w("planned", "2026-09-25", [{ logged: { weight: 99 } }], "planned"),
      w("skipped", "2026-09-24", [{ logged: { weight: 98 }, skipped: true }]),
      w("unlogged", "2026-09-23", [{ prescribed: { weight: 97 } }]),
      w("other", "2026-09-22", [{ typeId: "hang", logged: { weight: 96 } }]),
      w("now", "2026-09-28", [{ logged: { weight: 95 } }]),
    ], "now");
    expect(r?.workoutId).toBe("old");
  });

  it("takes the last logged slot when a session has the type twice", () => {
    const r = findLastLogged("pull", [w("a", "2026-09-10", [{ logged: { weight: 10 } }, { logged: { weight: 14 } }])]);
    expect(r?.values.weight).toBe(14);
  });

  it("is null when there's nothing", () => {
    expect(findLastLogged("pull", [])).toBeNull();
  });
});

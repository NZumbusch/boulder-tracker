import { describe, it, expect } from "vitest";
import { generateWorkoutsFromTemplate } from "./generateWorkoutsFromTemplate";
import type { WorkoutTemplate } from "../types";

const TEMPLATE: WorkoutTemplate = {
  id: "tpl1",
  name: "Board Power",
  dayOfWeek: "Monday",
  startTime: "18:00",
  plannedDuration: 90,
  exercises: [{ id: "slot1", typeId: "t1", activeParameters: [], prescribed: { duration: 30 } }],
};

describe("generateWorkoutsFromTemplate", () => {
  it("carries the template's planned time of day and duration onto the generated workout", () => {
    const [workout] = generateWorkoutsFromTemplate("2026-W25", [TEMPLATE]);
    expect(workout.startTime).toBe("18:00");
    expect(workout.plannedDuration).toBe(90);
    expect(workout.dayOfWeek).toBe("Monday");
  });

  it("leaves both undefined for a template that sets neither", () => {
    const [workout] = generateWorkoutsFromTemplate("2026-W25", [
      { id: "tpl2", name: "Open session", exercises: [] },
    ]);
    expect(workout.startTime).toBeUndefined();
    expect(workout.plannedDuration).toBeUndefined();
  });

  it("still regenerates exercise slot ids rather than reusing the template's", () => {
    const [workout] = generateWorkoutsFromTemplate("2026-W25", [TEMPLATE]);
    expect(workout.exercises[0].id).not.toBe("slot1");
  });
});

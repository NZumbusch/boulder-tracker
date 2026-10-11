import { describe, it, expect } from "vitest";
import type { ExerciseSlot, GoalEvent, Workout } from "../types";
import { baseLoad, taperPlan, TAPER_SHARES } from "./taper";

const asOf = new Date(2026, 9, 11, 12); // Sunday of W41
const done = (weekId: string, load: number): Workout => ({ id: `d${weekId}`, status: "completed", date: "2026-09-01", weekId, loadFactor: load, exercises: [] }) as Workout;
const planned = (weekId: string, minutes: number, intensity = 8): Workout => ({ id: `p${weekId}${minutes}`, status: "planned", date: null, weekId, dayOfWeek: "Tuesday", loadFactor: 0, exercises: [{ id: "x", typeId: "t", prescribed: { duration: minutes, plannedLoad: intensity } } as ExerciseSlot] }) as Workout;
const goal: GoalEvent = { id: "g", kind: "competition", name: "Boulder cup", date: "2026-11-01" }; // a Sunday in W44

describe("baseLoad", () => {
  it("averages the last four full weeks that carried training", () => {
    const w = [done("2026-W40", 2000), done("2026-W39", 3000), done("2026-W37", 1000), done("2026-W41", 9999)];
    expect(baseLoad(w, asOf)).toBe(2000); // W40, W39, (W38 empty), W37 -> 6000 / 3; the running week doesn't count
  });
  it("is 0 with nothing logged", () => {
    expect(baseLoad([], asOf)).toBe(0);
  });
});

describe("taperPlan", () => {
  const base = 2000;
  const workoutsForWeek = (all: Workout[]) => (id: string) => all.filter((w) => w.weekId === id);

  it("eases the target off week by week towards the goal's week", () => {
    const p = taperPlan({ goal, asOf, base, workoutsForWeek: workoutsForWeek([]), scale: 1 })!;
    expect(p.daysToGo).toBe(21);
    expect(p.weeks.map((w) => [w.weekId, w.weeksOut, Math.round(w.target)])).toEqual([
      ["2026-W41", 3, 2000], ["2026-W42", 2, 1700], ["2026-W43", 1, 1300], ["2026-W44", 0, 800],
    ]);
  });

  it("flags a week whose plan is well over its target", () => {
    // 150 minutes at intensity 8 is a big planned load for the week before the goal.
    const p = taperPlan({ goal, asOf, base, workoutsForWeek: workoutsForWeek([planned("2026-W43", 150), planned("2026-W44", 10, 3)]), scale: 1 })!;
    const w43 = p.weeks.find((w) => w.weekId === "2026-W43")!;
    expect(w43.planned).toBeGreaterThan(w43.target * 1.2);
    expect(w43.over).toBe(true);
    expect(p.weeks.find((w) => w.weekId === "2026-W44")!.over).toBe(false);
  });

  it("counts what is done plus what is still planned, and scales the plan to rated load", () => {
    const w = [done("2026-W41", 1500), planned("2026-W41", 60)];
    const lo = taperPlan({ goal, asOf, base, workoutsForWeek: workoutsForWeek(w), scale: 0.5 })!.weeks[0];
    const hi = taperPlan({ goal, asOf, base, workoutsForWeek: workoutsForWeek(w), scale: 2 })!.weeks[0];
    expect(lo.done).toBe(1500);
    expect(hi.planned! / lo.planned!).toBeCloseTo(4, 5);
  });

  it("has nothing for a goal that is past or without a base to taper from", () => {
    expect(taperPlan({ goal: { ...goal, date: "2026-10-01" }, asOf, base, workoutsForWeek: workoutsForWeek([]), scale: 1 })).toBeUndefined();
    expect(taperPlan({ goal, asOf, base: 0, workoutsForWeek: workoutsForWeek([]), scale: 1 })).toBeUndefined();
  });

  it("starts at the running week when the goal is within the taper's length", () => {
    const p = taperPlan({ goal: { ...goal, date: "2026-10-20" }, asOf, base, workoutsForWeek: workoutsForWeek([]), scale: 1 })!;
    expect(p.weeks.map((w) => w.weeksOut)).toEqual([2, 1, 0]);
    expect(TAPER_SHARES[1]).toBe(0.65);
  });
});

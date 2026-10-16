import { describe, it, expect } from "vitest";
import { hasLoggedWork, emptySessionWarning, slotHasLoggedWork } from "./emptySession";
import type { ExerciseSlot } from "../types";

const slot = (extra: Partial<ExerciseSlot> = {}): ExerciseSlot => ({ id: "s", typeId: "t", ...extra });

describe("hasLoggedWork", () => {
  it("is false with no exercises, or only planned ones", () => {
    expect(hasLoggedWork({ exercises: [] })).toBe(false);
    expect(hasLoggedWork({ exercises: [slot({ prescribed: { sets: 3, reps: 8 } })] })).toBe(false);
  });
  it("ignores skipped slots and slots with only notes or plan details", () => {
    expect(slotHasLoggedWork(slot({ skipped: true, logged: { sets: 3 } }))).toBe(false);
    expect(slotHasLoggedWork(slot({ logged: { notes: "felt ok", plannedLoad: 5, leadIn: 10 } }))).toBe(false);
    expect(slotHasLoggedWork(slot({ logged: { sets: 0, reps: [] } }))).toBe(false);
  });
  it("counts sets, reps arrays, durations and weights", () => {
    expect(slotHasLoggedWork(slot({ logged: { sets: 3 } }))).toBe(true);
    expect(slotHasLoggedWork(slot({ logged: { reps: [8, 7] } }))).toBe(true);
    expect(slotHasLoggedWork(slot({ logged: { duration: 20 } }))).toBe(true);
    expect(slotHasLoggedWork(slot({ logged: { weight: 12.5 } }))).toBe(true);
  });
  it("counts a test slot with any logged value", () => {
    expect(slotHasLoggedWork(slot({ test: { typeId: "b", name: "Max hang" }, logged: { duration: 10 } }))).toBe(true);
    expect(slotHasLoggedWork(slot({ test: { typeId: "b", name: "Max hang" } }))).toBe(false);
  });
  it("one slot with work is enough", () => {
    expect(hasLoggedWork({ exercises: [slot(), slot({ id: "b", logged: { sets: 1 } })] })).toBe(true);
  });
});

describe("emptySessionWarning", () => {
  it("asks for a done session with nothing logged", () => {
    expect(emptySessionWarning({ status: "completed", exercises: [slot({ prescribed: { sets: 3 } })] })?.title).toMatch(/nothing logged/);
  });
  it("is quiet for a done session with work", () => {
    expect(emptySessionWarning({ status: "completed", exercises: [slot({ logged: { sets: 3 } })] })).toBeNull();
  });
  it("asks for a planned session with no exercises, not for one with exercises", () => {
    expect(emptySessionWarning({ status: "planned", exercises: [] })?.title).toMatch(/no exercises/);
    expect(emptySessionWarning({ status: "planned", exercises: [slot()] })).toBeNull();
  });
  it("does not ask again for a session that was already empty when opened", () => {
    expect(emptySessionWarning({ status: "completed", exercises: [] }, true)).toBeNull();
  });
});

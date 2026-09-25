import { describe, it, expect } from "vitest";
import { startSession, pause, resume, logSlot, focusSlot, unfinishSlot, skipSlot, syncSlotClock, slotElapsedMs, type ActiveSession } from "./activeSession";
import { parseStoredSession, serializeSession } from "./persistSession";
import type { ExerciseSlot, Workout } from "../types";

const T0 = Date.parse("2026-09-22T18:00:00.000Z");
const MIN = 60_000;
const slot = (id: string): ExerciseSlot => ({ id, typeId: `type-${id}`, prescribed: { duration: 20 } });
const workout = (ids: string[]): Workout => ({ id: "w1", status: "planned", date: null, weekId: "2026-W39", loadFactor: 0, exercises: ids.map(slot) });

/** What the store does: every change goes through syncSlotClock. */
function apply(s: ActiveSession, fn: (s: ActiveSession) => ActiveSession, now: number) {
  return syncSlotClock(s, fn(s), now);
}

describe("per-exercise clock", () => {
  it("times the current exercise from the start", () => {
    const s = startSession(workout(["a", "b"]), T0);
    expect(slotElapsedMs(s, "a", T0 + 5 * MIN)).toBe(5 * MIN);
    expect(slotElapsedMs(s, "b", T0 + 5 * MIN)).toBe(0);
  });

  it("stops while the session is paused", () => {
    let s = startSession(workout(["a"]), T0);
    s = apply(s, (x) => pause(x, T0 + 2 * MIN), T0 + 2 * MIN);
    expect(slotElapsedMs(s, "a", T0 + 30 * MIN)).toBe(2 * MIN);
    s = apply(s, (x) => resume(x, T0 + 30 * MIN), T0 + 30 * MIN);
    expect(slotElapsedMs(s, "a", T0 + 33 * MIN)).toBe(5 * MIN);
  });

  it("moves on to the next exercise when one is finished, keeping the finished one's time", () => {
    let s = startSession(workout(["a", "b"]), T0);
    s = apply(s, (x) => logSlot(x, "a", { duration: 12 }), T0 + 12 * MIN);
    expect(slotElapsedMs(s, "a", T0 + 20 * MIN)).toBe(12 * MIN);
    expect(slotElapsedMs(s, "b", T0 + 20 * MIN)).toBe(8 * MIN);
  });

  it("carries on from where it was when you go back to an exercise", () => {
    let s = startSession(workout(["a", "b"]), T0);
    s = apply(s, (x) => focusSlot(x, 1), T0 + 4 * MIN);
    s = apply(s, (x) => focusSlot(x, 0), T0 + 10 * MIN);
    expect(slotElapsedMs(s, "a", T0 + 11 * MIN)).toBe(5 * MIN);
    expect(slotElapsedMs(s, "b", T0 + 11 * MIN)).toBe(6 * MIN);
  });

  it("resumes a reopened exercise from its logged (possibly corrected) duration", () => {
    let s = startSession(workout(["a", "b"]), T0);
    s = apply(s, (x) => logSlot(x, "a", { duration: 15 }), T0 + 12 * MIN);
    s = apply(s, (x) => unfinishSlot(x, "a"), T0 + 20 * MIN);
    expect(slotElapsedMs(s, "a", T0 + 21 * MIN)).toBe(16 * MIN);
  });

  it("does not time a skipped exercise or run past the last one", () => {
    let s = startSession(workout(["a"]), T0);
    s = apply(s, (x) => skipSlot(x, "a"), T0 + MIN);
    expect(slotElapsedMs(s, "a", T0 + 10 * MIN)).toBe(MIN);
    expect(s.slotClock).toEqual({ slotId: null, since: null });
  });

  it("survives being saved and restored", () => {
    const s = startSession(workout(["a"]), T0);
    const restored = parseStoredSession(serializeSession(s))!;
    expect(slotElapsedMs(restored, "a", T0 + 3 * MIN)).toBe(3 * MIN);
  });
});

import { describe, it, expect } from "vitest";
import { serializeSession, parseStoredSession } from "./persistSession";
import { startSession, logSlot, pause, elapsedMinutes, type ActiveSession } from "./activeSession";
import type { ExerciseSlot, Workout } from "../types";

const T0 = Date.parse("2026-09-22T18:00:00.000Z");
const MIN = 60_000;

function slot(id: string): ExerciseSlot {
  return { id, typeId: `type-${id}`, prescribed: { duration: 20 } };
}

function workout(exercises: ExerciseSlot[], extra: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    status: "planned",
    date: null,
    weekId: "2026-W39",
    notes: "Session",
    loadFactor: 0,
    exercises,
    ...extra,
  };
}

function roundTrip(session: ActiveSession): ActiveSession | null {
  return parseStoredSession(serializeSession(session));
}

describe("round-tripping a session", () => {
  it("preserves a running session exactly", () => {
    const s = startSession(workout([slot("a"), slot("b")]), T0, { sourceWorkoutId: "planned-1" });
    expect(roundTrip(s)).toEqual(s);
  });

  it("preserves logged work across a restart", () => {
    const s = logSlot(startSession(workout([slot("a"), slot("b")]), T0), "a", { duration: 25 });
    const back = roundTrip(s)!;
    expect(back.workout.exercises[0].logged).toEqual({ duration: 25 });
    expect(back.currentIndex).toBe(1);
  });

  it("preserves elapsed time across a restart, including a paused session", () => {
    const running = startSession(workout([slot("a")]), T0);
    expect(elapsedMinutes(roundTrip(running)!, T0 + 30 * MIN)).toBe(30);

    const paused = pause(running, T0 + 12 * MIN);
    const back = roundTrip(paused)!;
    expect(back.runningSince).toBeNull();
    expect(elapsedMinutes(back, T0 + 500 * MIN)).toBe(12);
  });
});

describe("parseStoredSession", () => {
  it("returns null for nothing stored", () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession("")).toBeNull();
  });

  it("never throws on garbage, it just declines", () => {
    for (const bad of ["not json", "{", "[1,2,3]", "42", "null", '"a string"']) {
      expect(() => parseStoredSession(bad)).not.toThrow();
      expect(parseStoredSession(bad)).toBeNull();
    }
  });

  it("declines a blob with no usable workout", () => {
    expect(parseStoredSession(JSON.stringify({ startedAt: new Date(T0).toISOString() }))).toBeNull();
    expect(parseStoredSession(JSON.stringify({ workout: { id: "w1" } }))).toBeNull();
    expect(parseStoredSession(JSON.stringify({ workout: { id: "w1", weekId: "x" } }))).toBeNull();
  });

  it("drops exercise entries that are not slots, keeping the rest", () => {
    const raw = JSON.stringify({
      workout: { ...workout([slot("a")]), exercises: [slot("a"), null, 42, { id: "b" }, slot("c")] },
      startedAt: new Date(T0).toISOString(),
      accumulatedMs: 0,
      runningSince: T0,
      currentIndex: 0,
      sourceWorkoutId: null,
    });
    expect(parseStoredSession(raw)!.workout.exercises.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("repairs a broken clock rather than losing the session", () => {
    const raw = JSON.stringify({
      workout: workout([slot("a")]),
      startedAt: "not a date",
      accumulatedMs: -5,
      runningSince: "nonsense",
      currentIndex: -3,
    });
    const back = parseStoredSession(raw)!;
    expect(Number.isNaN(Date.parse(back.startedAt))).toBe(false);
    expect(back.accumulatedMs).toBe(0);
    expect(back.runningSince).toBeNull();
    expect(back.currentIndex).toBe(0);
  });

  it("keeps a runningSince ahead of the clock, reading zero rather than negative elapsed time", () => {
    const raw = JSON.stringify({
      workout: workout([slot("a")]),
      startedAt: new Date(T0).toISOString(),
      accumulatedMs: 0,
      runningSince: T0 + 10 * MIN,
      currentIndex: 0,
    });
    const back = parseStoredSession(raw)!;
    expect(back.runningSince).toBe(T0 + 10 * MIN);
    expect(elapsedMinutes(back, T0)).toBe(0);
    // ...and it heals itself once the clock catches up.
    expect(elapsedMinutes(back, T0 + 25 * MIN)).toBe(15);
  });

  it("clamps currentIndex into the exercise list", () => {
    const raw = JSON.stringify({
      workout: workout([slot("a"), slot("b")]),
      startedAt: new Date(T0).toISOString(),
      currentIndex: 99,
    });
    expect(parseStoredSession(raw)!.currentIndex).toBe(1);
  });

  it("forces a restored session back to planned - a stored session is never finished", () => {
    const raw = JSON.stringify({
      workout: workout([slot("a")], { status: "completed", date: new Date(T0).toISOString() }),
      startedAt: new Date(T0).toISOString(),
    });
    expect(parseStoredSession(raw)!.workout.status).toBe("planned");
  });

  it("strips the transient provisional flag, which must never come back to life", () => {
    const raw = JSON.stringify({
      workout: { ...workout([slot("a")]), provisional: true },
      startedAt: new Date(T0).toISOString(),
    });
    expect(parseStoredSession(raw)!.workout.provisional).toBeUndefined();
  });

  it("defaults a missing sourceWorkoutId to null rather than undefined", () => {
    const raw = JSON.stringify({ workout: workout([slot("a")]), startedAt: new Date(T0).toISOString() });
    expect(parseStoredSession(raw)!.sourceWorkoutId).toBeNull();
  });
});

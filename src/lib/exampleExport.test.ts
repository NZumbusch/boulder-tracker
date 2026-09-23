import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ExerciseSlot, TrainingData, Workout } from "./types";
import { workoutPlannedLoad, slotActualLoad, calculateLoadFactor } from "./types";
import { slotValues } from "./exerciseSlot";
import { repsRepresentative } from "./exercise/reps";
import {
  estimateExerciseDuration,
  estimateSessionDuration,
  sessionDuration,
} from "./planning/sessionDuration";
import { calculateWorkoutAdherence } from "./analytics/loadAnalytics";
import { computeFatigueReminderTime } from "./notifications/fatigueReminder";
import { generateICS } from "./ics";
import { runDataMigrations, assertMigrationInvariants } from "./storage/migrations";
import { DATA_EXPORT_VERSION } from "./constants";
import {
  specFromExercise,
  buildTimeline,
  timelineSeconds,
  positionAt,
  progressAt,
  loggedValuesFor,
} from "./timer/intervalTimer";
import { shareImageFileName } from "./share/imageShare";
import { startSession, logSlot, toCompletedWorkout } from "./session/activeSession";

/**
 * Runs the real modules over a real backup export.
 *
 * Unit tests are built from data shaped the way the types say it should
 * be; a genuine export is shaped the way the app has actually written it
 * over months, which is not the same thing. This catches the difference -
 * it is how the array-valued `reps` below was found.
 *
 * The export is the user's own training data and is deliberately not
 * committed, so this skips when it isn't there rather than failing a
 * clean checkout. Drop a `example.json` backup into `stuff/` (gitignored) to run it.
 */
const EXPORT_PATH = resolve(__dirname, "../../stuff/example.json");
const present = existsSync(EXPORT_PATH);

const data: TrainingData & { exportVersion?: string } = present
  ? JSON.parse(readFileSync(EXPORT_PATH, "utf8"))
  : ({ workouts: [] } as unknown as TrainingData);

const suite = present ? describe : describe.skip;

/** Every number the app computes must be a real, finite, non-negative number. */
function expectSaneNumber(value: number, what: string) {
  expect(Number.isFinite(value), `${what} is not finite: ${value}`).toBe(true);
  expect(value, `${what} is negative`).toBeGreaterThanOrEqual(0);
}

suite("a real export", () => {
  const workouts: Workout[] = data.workouts ?? [];
  const slots: ExerciseSlot[] = workouts.flatMap((w) => w.exercises ?? []);

  it("has workouts and exercises to test against", () => {
    expect(workouts.length).toBeGreaterThan(0);
    expect(slots.length).toBeGreaterThan(0);
  });

  it("lands on the current schema version after migration", () => {
    const migrated = JSON.parse(JSON.stringify(data));
    runDataMigrations(migrated);
    expect(migrated.exportVersion).toBe(DATA_EXPORT_VERSION);
  });

  it("survives the migration chain and its invariant check", () => {
    const before = JSON.parse(JSON.stringify(data));
    const after = JSON.parse(JSON.stringify(data));
    expect(() => runDataMigrations(after)).not.toThrow();
    expect(() => assertMigrationInvariants(before, after)).not.toThrow();
  });

  describe("duration", () => {
    it("estimates every session as a sane number of minutes", () => {
      for (const w of workouts) {
        const estimate = estimateSessionDuration(w);
        expectSaneNumber(estimate, `estimate for "${w.notes}"`);
        expect(estimate, `estimate for "${w.notes}" is implausible`).toBeLessThan(24 * 60);
      }
    });

    it("reports a sane actual duration for every session", () => {
      for (const w of workouts) {
        const actual = sessionDuration(w);
        expectSaneNumber(actual, `duration for "${w.notes}"`);
        expect(actual, `duration for "${w.notes}" is implausible`).toBeLessThan(24 * 60);
      }
    });

    it("never reports a zero-minute session", () => {
      for (const w of workouts) {
        expect(sessionDuration(w), `"${w.notes}" reports no duration at all`).toBeGreaterThan(0);
      }
    });

    it("estimates every exercise without producing NaN", () => {
      for (const slot of slots) {
        const estimate = estimateExerciseDuration(slotValues(slot));
        if (estimate !== undefined) expectSaneNumber(estimate, `exercise ${slot.typeId}`);
      }
    });
  });

  describe("load", () => {
    it("computes a sane planned load for every session", () => {
      for (const w of workouts) expectSaneNumber(workoutPlannedLoad(w.exercises ?? []), `planned load for "${w.notes}"`);
    });

    it("computes a sane actual load for every slot", () => {
      for (const slot of slots) expectSaneNumber(slotActualLoad(slot), `actual load for ${slot.typeId}`);
    });

    it("does not change any stored planned load, because every slot here was prescribed", () => {
      // The `slotPlannedLoad` fix only zeroes slots that carry no
      // `prescribed` block. This export has none, so nothing it holds
      // shifts - worth pinning, since the alternative would silently
      // rewrite historical load.
      const unprescribed = slots.filter((s) => !s.prescribed);
      expect(unprescribed).toHaveLength(0);
    });

    it("computes adherence for every session without NaN", () => {
      for (const w of workouts) {
        const a = calculateWorkoutAdherence(w);
        expectSaneNumber(a.plannedLoad, `adherence plannedLoad "${w.notes}"`);
        expectSaneNumber(a.actualLoad, `adherence actualLoad "${w.notes}"`);
        expect(a.completionRate).toBeGreaterThanOrEqual(0);
        expect(a.completionRate).toBeLessThanOrEqual(1);
      }
    });

    it("computes a sane load factor from each session's own duration", () => {
      for (const w of workouts) {
        const load = calculateLoadFactor(sessionDuration(w), w.fingers ?? 5, w.core ?? 5, w.systemic ?? 5);
        expectSaneNumber(load, `load factor for "${w.notes}"`);
      }
    });
  });

  describe("the interval timer", () => {
    it("builds a runnable protocol from every exercise", () => {
      for (const slot of slots) {
        const spec = specFromExercise(slotValues(slot));
        const timeline = buildTimeline(spec);
        expect(timeline.length, `empty timeline for ${slot.typeId}`).toBeGreaterThan(0);

        const total = timelineSeconds(timeline);
        expectSaneNumber(total, `timeline length for ${slot.typeId}`);
        expect(total, `implausible protocol for ${slot.typeId}`).toBeLessThan(6 * 60 * 60);

        // Position and progress must hold at both ends and in the middle.
        for (const at of [0, total / 2, total, total + 60]) {
          const pos = positionAt(timeline, at);
          expectSaneNumber(pos.remaining, `remaining at ${at}s for ${slot.typeId}`);
          const prog = progressAt(timeline, spec, at);
          expectSaneNumber(prog.setsCompleted, `sets at ${at}s`);
          expectSaneNumber(prog.repsCompleted, `reps at ${at}s`);
          expect(prog.currentSet).toBeGreaterThanOrEqual(1);
          expect(prog.currentRep).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it("produces loggable values from a finished run of every exercise", () => {
      for (const slot of slots) {
        const spec = specFromExercise(slotValues(slot));
        const timeline = buildTimeline(spec);
        const values = loggedValuesFor(spec, progressAt(timeline, spec, timelineSeconds(timeline)));
        expectSaneNumber(values.sets!, `logged sets for ${slot.typeId}`);
        expectSaneNumber(repsRepresentative(values.reps)!, `logged reps for ${slot.typeId}`);
        expect(values.sets).toBeGreaterThan(0);
        expect(repsRepresentative(values.reps)).toBeGreaterThan(0);
      }
    });
  });

  describe("running a session built from this data", () => {
    it("can start, log through and finish every session without throwing", () => {
      const now = Date.parse("2026-09-22T18:00:00.000Z");
      for (const w of workouts) {
        const session = startSession(w, now);
        let current = session;
        for (const slot of session.workout.exercises) {
          current = logSlot(current, slot.id, slotValues(slot));
        }
        const finished = toCompletedWorkout(current, now + 60 * 60_000);
        expect(finished.status).toBe("completed");
        expect(finished.exercises).toHaveLength(w.exercises?.length ?? 0);
        expectSaneNumber(sessionDuration(finished), `finished duration for "${w.notes}"`);
      }
    });

    it("leaves the source workouts untouched", () => {
      const snapshot = JSON.stringify(workouts);
      for (const w of workouts) startSession(w, Date.now());
      expect(JSON.stringify(workouts)).toBe(snapshot);
    });
  });

  describe("export paths", () => {
    it("names a share image for every session", () => {
      for (const w of workouts) {
        expect(shareImageFileName(w.date)).toMatch(/^boulder-session-\d{4}-\d{2}-\d{2}\.png$/);
      }
    });

    it("generates a calendar without throwing or emitting NaN", () => {
      const ics = generateICS(workouts);
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).not.toContain("NaN");
      expect(ics).not.toContain("undefined");
    });

    it("computes a fatigue reminder time for every planned session", () => {
      for (const w of workouts.filter((x) => x.status === "planned")) {
        const at = computeFatigueReminderTime(w);
        if (at !== null) expect(Number.isNaN(at.getTime())).toBe(false);
      }
    });
  });

  describe("shape surprises worth knowing about", () => {
    /**
     * `ExerciseValues.reps` is typed `number`, but a real export carries
     * per-set arrays (`[10, 7, 8, 8]` - four sets of pull-ups). Nothing
     * crashes on it, and `estimateExerciseDuration` reads it correctly,
     * but it is not what the type promises.
     */
    it("documents that reps can be a per-set array", () => {
      const arrayReps = slots.filter((s) =>
        Array.isArray((s.logged as { reps?: unknown } | undefined)?.reps) ||
        Array.isArray((s.prescribed as { reps?: unknown } | undefined)?.reps),
      );
      // Not asserted as zero: this is real data, and the point is that the
      // app must cope with it rather than that it shouldn't exist.
      for (const slot of arrayReps) {
        const estimate = estimateExerciseDuration(slotValues(slot));
        if (estimate !== undefined) expectSaneNumber(estimate, `array-reps exercise ${slot.typeId}`);
        const spec = specFromExercise(slotValues(slot));
        expect(Number.isFinite(spec.reps)).toBe(true);
        expect(spec.reps).toBeGreaterThan(0);
      }
    });

    it("has no slot missing both prescribed and logged", () => {
      const empty = slots.filter((s) => !s.prescribed && !s.logged);
      expect(empty).toHaveLength(0);
    });
  });
});

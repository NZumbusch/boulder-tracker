import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// Mirrors the real adapters: setItem structured-clones, so anything
// unserialisable reaching storage fails here the way it does in a browser.
const { setItem } = vi.hoisted(() => ({
  setItem: vi.fn(async (_key: string, value: unknown) => {
    structuredClone(value);
  }),
}));
vi.mock("localforage", () => ({
  default: { config: vi.fn(), setItem, getItem: vi.fn(async () => null) },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage, runDataMigrations, assertMigrationInvariants } from "./index";
import { setDbState, _dbState } from "./persistence";
import { DATA_EXPORT_VERSION } from "../constants";
import {
  isWeekProvisional,
  provisionalPastWeeks,
  effectiveWorkoutsForWeek,
  type WeekProjectionContext,
} from "../planning/weekProjection";
import { migratePreferences } from "../preferences/migrate";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** A real pre-existing install's export (v2.1: 16 workouts, 4 phase assignments). */
function legacyBackup(): any {
  return JSON.parse(
    readFileSync(path.join(__dirname, "__fixtures__", "backup-2.1.json"), "utf-8"),
  );
}

function contextFrom(db: any): WeekProjectionContext {
  return {
    workouts: db.workouts ?? [],
    trainingBlocks: db.trainingBlocks ?? [],
    templates: db.templates ?? {},
    weekOverrides: db.weekOverrides ?? [],
  };
}

/**
 * Upgrading the app must not change what a returning user sees. These drive
 * a genuine old backup through the migration chain and then through the
 * copy-on-write projection layer added on top of it.
 */
describe("upgrading an existing install", () => {
  beforeEach(() => setItem.mockClear());

  it("migrates a v2.1 backup to the current version with its invariants intact", () => {
    const before = legacyBackup();
    const data = legacyBackup();
    runDataMigrations(data);
    expect(data.exportVersion).toBe(DATA_EXPORT_VERSION);
    expect(() => assertMigrationInvariants(before, data)).not.toThrow();
  });

  it("keeps every workout, and every week that had sessions still shows them", () => {
    const data = legacyBackup();
    const originalCount = data.workouts.length;
    runDataMigrations(data);

    expect(data.workouts).toHaveLength(originalCount);

    const ctx = contextFrom(data);
    const weeksWithWorkouts = [...new Set(data.workouts.map((w: any) => w.weekId))] as string[];
    expect(weeksWithWorkouts.length).toBeGreaterThan(0);
    for (const weekId of weeksWithWorkouts) {
      // Stored rows win: an existing week is never provisional, so nothing
      // it shows can change under the new projection layer.
      expect(isWeekProvisional(ctx, weekId)).toBe(false);
      const effective = effectiveWorkoutsForWeek(ctx, weekId);
      expect(effective).toEqual(data.workouts.filter((w: any) => w.weekId === weekId));
      expect(effective.every((w) => w.provisional === undefined)).toBe(true);
    }
  });

  it("does not rewrite history: no past week with sessions gets materialised on load", () => {
    const data = legacyBackup();
    runDataMigrations(data);
    const ctx = contextFrom(data);

    // Far-future "now", so every week in the backup counts as past.
    const stale = provisionalPastWeeks(ctx, "2099-W01");
    const weeksWithWorkouts = new Set(data.workouts.map((w: any) => w.weekId));
    for (const weekId of stale) {
      expect(weeksWithWorkouts.has(weekId)).toBe(false);
    }
  });

  it("still persists cleanly after migrating - the whole blob stays serialisable", async () => {
    const data = legacyBackup();
    runDataMigrations(data);
    setDbState(data);

    const [firstWorkout] = await storage.getWorkouts();
    await storage.saveWorkout({ ...firstWorkout, notes: "edited after upgrade" });

    expect(() => structuredClone(_dbState)).not.toThrow();
    expect((await storage.getWorkouts()).find((w) => w.id === firstWorkout.id)?.notes)
      .toBe("edited after upgrade");
  });

  it("leaves legacy workouts without the new optional fields untouched", () => {
    const data = legacyBackup();
    runDataMigrations(data);
    // plannedDuration/startTime are optional additions - absent on old rows,
    // and nothing may invent a value for them.
    for (const w of data.workouts) {
      expect(w.plannedDuration).toBeUndefined();
    }
  });

  it("keeps an existing preferences blob's settings and defaults the new one", () => {
    // A blob written before chartDensity existed. The version is unchanged,
    // so it must be accepted rather than reset to defaults wholesale.
    const existing = {
      version: 1,
      textScale: "lg",
      motion: "reduced",
      theme: "light",
      fatigueChartStyle: "radar",
      planFormat: "weekly",
    };
    const migrated = migratePreferences(existing);
    expect(migrated.textScale).toBe("lg");
    expect(migrated.motion).toBe("reduced");
    expect(migrated.theme).toBe("light");
    expect(migrated.fatigueChartStyle).toBe("radar");
    expect("planFormat" in migrated).toBe(false); // retired setting, dropped on load
    expect(migrated.chartDensity).toBe("auto");
  });
});

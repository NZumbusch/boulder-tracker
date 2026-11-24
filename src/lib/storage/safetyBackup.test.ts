import { describe, it, expect, vi, beforeEach } from "vitest";

const { files, fs } = vi.hoisted(() => {
  const files = new Map<string, string>();
  const key = (directory: string, path: string) => `${directory}/${path}`;
  const fs = {
    readFile: async ({ path, directory }: { path: string; directory: string }) => {
      const data = files.get(key(directory, path));
      if (data === undefined) throw new Error("File does not exist");
      return { data };
    },
    writeFile: async ({ path, directory, data }: { path: string; directory: string; data: string }) => void files.set(key(directory, path), data),
    appendFile: async ({ path, directory, data }: { path: string; directory: string; data: string }) => void files.set(key(directory, path), (files.get(key(directory, path)) ?? "") + data),
    deleteFile: async ({ path, directory }: { path: string; directory: string }) => {
      if (!files.delete(key(directory, path))) throw new Error("File does not exist");
    },
    rename: async ({ from, to, directory }: { from: string; to: string; directory: string }) => {
      const data = files.get(key(directory, from))!;
      files.delete(key(directory, from));
      files.set(key(directory, to), data);
    },
    readdir: async ({ path, directory }: { path: string; directory: string }) => {
      const prefix = key(directory, `${path}/`);
      return { files: [...files.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/")).map((k) => ({ name: k.slice(prefix.length) })) };
    },
  };
  return { files, fs };
});

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA", Documents: "DOCUMENTS", External: "EXTERNAL" },
  Encoding: { UTF8: "utf8" },
  Filesystem: fs,
}));
vi.mock("localforage", () => ({ default: { config: vi.fn(), getItem: vi.fn(async () => null), setItem: vi.fn(), removeItem: vi.fn() } }));

import { initDB, setDbState, _dbState } from "./persistence";
import { captureSafetyBackup, resetSafetyBackupsForTests, safetyFileName, safetyToPrune, syncNeedsBackup, writeSafetyBackup, SAFETY_KEEP } from "./safetyBackup";
import { readDataLog, resetDataLogForTests } from "./dataLogStore";
import { resetDataWatchForTests } from "./dataWatch";

const done = { id: "mon", status: "completed", loadFactor: 759 };
const plan = { id: "tue", status: "planned" };

describe("syncNeedsBackup", () => {
  const current = { workouts: [done, plan], dailyMetrics: Array.from({ length: 30 }, (_, i) => ({ id: `m${i}` })) };

  it("is needed when a merge changes or deletes a logged session", () => {
    expect(syncNeedsBackup(current, { workouts: [{ ...done, status: "planned" }, plan] }, ["workouts"])).toBe(true);
    expect(syncNeedsBackup(current, { workouts: [plan] }, ["workouts"])).toBe(true);
  });

  it("is needed when a merge deletes many records, or a large share of a table", () => {
    expect(syncNeedsBackup(current, { dailyMetrics: current.dailyMetrics.slice(0, 5) }, ["dailyMetrics"])).toBe(true);
    expect(syncNeedsBackup({ workouts: [plan, { id: "a" }, { id: "b" }, { id: "c" }] }, { workouts: [plan, { id: "a" }, { id: "b" }] }, ["workouts"])).toBe(true);
  });

  it("is not needed for ordinary merges: planned sessions edited, records added, a few removed", () => {
    expect(syncNeedsBackup(current, { workouts: [done, { ...plan, startTime: "18:00" }, { id: "new", status: "planned" }] }, ["workouts"])).toBe(false);
    expect(syncNeedsBackup(current, { dailyMetrics: current.dailyMetrics.slice(1) }, ["dailyMetrics"])).toBe(false);
  });
});

describe("file names", () => {
  it("sort by time and say why", () => {
    expect(safetyFileName("before a sync merge", new Date(2026, 10, 24, 13, 5, 9))).toBe("safety-2026-11-24_13-05-09-before-a-sync-merge.json");
  });

  it("only safety backups beyond the newest few are pruned", () => {
    expect(safetyToPrune(["safety-2026-01-02_x.json", "other.json", "safety-2026-01-01_x.json", "safety-2026-01-03_x.json"], 2)).toEqual(["safety-2026-01-01_x.json"]);
  });
});

describe("writing", () => {
  beforeEach(async () => {
    files.clear();
    files.set("DATA/boulder_tracker_db.json", JSON.stringify({ workouts: [done, plan], garminArchive: [{ id: "g1", kind: "sleep", data: {} }], exportVersion: "3.39" }));
    resetDataLogForTests();
    resetDataWatchForTests();
    resetSafetyBackupsForTests();
    setDbState(null);
    await initDB();
  });

  const backups = () => [...files.keys()].filter((k) => k.startsWith("DOCUMENTS/BoulderTracker/safety/"));

  it("writes the data as it was when captured, without the Garmin archive, to Documents", async () => {
    const captured = captureSafetyBackup("before a sync merge", new Date(2026, 10, 24, 13, 0, 0))!;
    _dbState.workouts = [];
    await captured.write();
    expect(backups()).toEqual(["DOCUMENTS/BoulderTracker/safety/safety-2026-11-24_13-00-00-before-a-sync-merge.json"]);
    const content = JSON.parse(files.get(backups()[0])!);
    expect(content.workouts).toEqual([done, plan]);
    expect(content.garminArchive).toBeUndefined();
    expect(content.safetyBackup).toMatchObject({ reason: "before a sync merge", excludedTables: ["garminArchive"] });
    expect((await readDataLog()).some((e) => e.kind === "backup" && /safety-2026-11-24_13-00-00/.test(e.msg))).toBe(true);
  });

  it("writes one per reason in ten minutes, and keeps the newest few", async () => {
    await writeSafetyBackup("before an AI plan change");
    await writeSafetyBackup("before an AI plan change");
    expect(backups()).toHaveLength(1);
    for (let i = 0; i < SAFETY_KEEP + 3; i++) captureSafetyBackup(`reason ${i}`, new Date(2026, 0, 1, 10, i))!.write();
    await new Promise((r) => setTimeout(r, 0));
    await writeSafetyBackup("last");
    expect(backups().length).toBe(SAFETY_KEEP);
  });

  it("restoring one keeps the Garmin data on the device", async () => {
    const { storage } = await import("./index");
    // "Restore previous" puts a kept copy back through the same step a backup file goes through (replaceDatabase).
    const safety = { workouts: [plan], exportVersion: "3.39", safetyBackup: { reason: "x", at: "2026-11-24T12:00:00Z", excludedTables: ["garminArchive"] } };
    files.set("DATA/boulder_tracker_pre_restore.json", JSON.stringify({ at: "2026-11-24T12:00:00Z", workouts: 1, data: safety }));
    expect(await storage.restorePrevious()).toBe(true);
    expect(_dbState.workouts).toEqual([plan]);
    expect(_dbState.garminArchive).toHaveLength(1);
    // A restore turns the logged session back on purpose: not refused.
    expect((await readDataLog()).some((e) => e.kind === "guard")).toBe(false);
  });
});

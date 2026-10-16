import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("localforage", () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async (k: string) => (k in db ? structuredClone(db[k]) : null)),
    setItem: vi.fn(async (k: string, v: unknown) => { db[k] = structuredClone(v); }),
    removeItem: vi.fn(async (k: string) => { delete db[k]; }),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage } from "./index";
import { setDbState, _dbState } from "./persistence";

class FakeReader {
  onload: ((e: { target: { result: string } }) => void) | null = null;
  readAsText(file: Blob) { void file.text().then((result) => this.onload?.({ target: { result } })); }
}
vi.stubGlobal("FileReader", FakeReader);

const w = (id: string) => ({ id, status: "planned", date: null, weekId: "2026-W41", loadFactor: 0, exercises: [] });
const file = (ids: string[]) => new File([JSON.stringify({ exportVersion: "3.37", workouts: ids.map(w), trainingBlocks: [], dismissedSessions: [], phaseDefs: [], exerciseTypes: [], templates: {} })], "b.json");

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  setDbState({ workouts: [w("mine1"), w("mine2")], trainingBlocks: [], dismissedSessions: [], weekNotes: [], exerciseTypes: [], phaseDefs: [], templates: {}, exportVersion: "3.37" });
});

describe("Restore previous", () => {
  it("has nothing before any restore", async () => {
    expect(await storage.getRestoreSnapshot()).toBeNull();
    expect(await storage.restorePrevious()).toBe(false);
  });

  it("a restore keeps what it replaced, and Restore previous brings it back", async () => {
    await storage.importData(file(["other"]));
    expect(_dbState.workouts.map((x: any) => x.id)).toEqual(["other"]);
    const snap = await storage.getRestoreSnapshot();
    expect(snap?.workouts).toBe(2);

    expect(await storage.restorePrevious()).toBe(true);
    expect(_dbState.workouts.map((x: any) => x.id)).toEqual(["mine1", "mine2"]);
  });

  it("is itself undoable: a second tap goes back to the restored file", async () => {
    await storage.importData(file(["other"]));
    await storage.restorePrevious();
    expect((await storage.getRestoreSnapshot())?.workouts).toBe(1);
    await storage.restorePrevious();
    expect(_dbState.workouts.map((x: any) => x.id)).toEqual(["other"]);
  });

  it("a cancelled import keeps no snapshot", async () => {
    await expect(storage.importData(file(["other"]), () => {}, async () => false)).rejects.toThrow();
    expect(await storage.getRestoreSnapshot()).toBeNull();
    expect(_dbState.workouts).toHaveLength(2);
  });

  it("the snapshot is a copy, not the live data", async () => {
    await storage.importData(file(["other"]));
    _dbState.workouts.push(w("later"));
    await storage.restorePrevious();
    expect(_dbState.workouts).toHaveLength(2);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("localforage", () => ({
  default: { config: vi.fn(), setItem: vi.fn(async () => {}), getItem: vi.fn(async () => null), removeItem: vi.fn(async () => {}) },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage } from "./index";
import { setDbState, _dbState } from "./persistence";

// Node has no FileReader; the import only needs readAsText -> onload.
class FakeReader {
  onload: ((e: { target: { result: string } }) => void) | null = null;
  readAsText(file: Blob) { void file.text().then((result) => this.onload?.({ target: { result } })); }
}
vi.stubGlobal("FileReader", FakeReader);

const backup = (extra: Record<string, unknown> = {}) =>
  new File([JSON.stringify({
    exportVersion: "3.34",
    workouts: [{ id: "a", status: "planned", date: null, weekId: "2026-W41", loadFactor: 0, exercises: [] }],
    trainingBlocks: [{ id: "b", name: "B", phaseId: "p", startWeekId: "2026-W40", endWeekId: "2026-W42" }],
    weekOverrides: [{ weekId: "2026-W43", customized: true }],
    phaseDefs: [{ id: "p", name: "P", order: 1 }],
    exerciseTypes: [],
    templates: {},
    ...extra,
  })], "backup.json");

beforeEach(() => setDbState({ workouts: [], trainingBlocks: [], dismissedSessions: [{ id: "prov:2030-W01:*", weekId: "2030-W01" }], weekNotes: [], exerciseTypes: [], phaseDefs: [], templates: {}, exportVersion: "3.36" }));

describe("importing a backup", () => {
  it("brings its dismissals (from the migration of an older backup), and drops the ones of the data it replaces", async () => {
    await storage.importData(backup());
    expect((await storage.getDismissedSessions()).map((d) => d.id).sort()).toEqual(["prov:2026-W41:*", "prov:2026-W43:*"]);
    expect(_dbState.weekOverrides).toBeUndefined();
    expect(_dbState.exportVersion).toBe("3.36");
  });

  it("takes a current backup's own dismissals as they are", async () => {
    await storage.importData(backup({ exportVersion: "3.36", weekOverrides: undefined, trainingBlocks: [{ id: "b", name: "B", phaseId: "p", startDate: "2026-10-05", endDate: "2026-10-18" }], dismissedSessions: [{ id: "prov:2026-W41:t1", weekId: "2026-W41" }] }));
    expect(await storage.getDismissedSessions()).toEqual([{ id: "prov:2026-W41:t1", weekId: "2026-W41" }]);
  });

  it("a backup with none leaves none", async () => {
    await storage.importData(backup({ exportVersion: "3.36", weekOverrides: undefined, trainingBlocks: [] }));
    expect(await storage.getDismissedSessions()).toEqual([]);
  });
});

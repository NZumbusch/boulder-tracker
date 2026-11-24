import { describe, it, expect, vi, beforeEach } from "vitest";

// An in-memory Android filesystem (files by "DIR/path"), with appendFile for the log.
const { files, fs } = vi.hoisted(() => {
  const files = new Map<string, string>();
  const key = (directory: string, path: string) => `${directory}/${path}`;
  const fs = {
    readFile: async ({ path, directory }: { path: string; directory: string }) => {
      const data = files.get(key(directory, path));
      if (data === undefined) throw new Error("File does not exist");
      return { data };
    },
    writeFile: async ({ path, directory, data }: { path: string; directory: string; data: string }) => {
      files.set(key(directory, path), data);
    },
    appendFile: async ({ path, directory, data }: { path: string; directory: string; data: string }) => {
      files.set(key(directory, path), (files.get(key(directory, path)) ?? "") + data);
    },
    deleteFile: async ({ path, directory }: { path: string; directory: string }) => {
      if (!files.delete(key(directory, path))) throw new Error("File does not exist");
    },
    rename: async ({ from, to, directory }: { from: string; to: string; directory: string }) => {
      const data = files.get(key(directory, from));
      if (data === undefined) throw new Error("File does not exist");
      files.delete(key(directory, from));
      files.set(key(directory, to), data);
    },
    readdir: async () => ({ files: [] }),
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

import { initDB, flushDB, setDbState, setDemoMode, _dbState } from "./persistence";
import { dataOp, flushDataLog, readDataLog, resetDataLogForTests, parseLogLines, recordData } from "./dataLogStore";
import { resetDataWatchForTests, setGuardListener } from "./dataWatch";

const DB = "DATA/boulder_tracker_db.json";
const LOG = "DATA/boulder_tracker_data_log.jsonl";
const done = { id: "mon", status: "completed", weekId: "2026-W48", date: "2026-11-23T20:22:10.000Z", notes: "Hypertrophy A", loadFactor: 759, exercises: [] };
const stale = { id: "mon", status: "planned", weekId: "2026-W48", dayOfWeek: "Monday", date: null, notes: "Hypertrophy A", loadFactor: 0, exercises: [] };
const tue = { id: "tue", status: "planned", weekId: "2026-W48", date: null, exercises: [] };

const onDisk = () => JSON.parse(files.get(DB)!).workouts as { id: string; status: string }[];

async function start(workouts: unknown[]) {
  files.clear();
  files.set(DB, JSON.stringify({ workouts, exportVersion: "3.39" }));
  resetDataLogForTests();
  resetDataWatchForTests();
  setDbState(null);
  await initDB();
}

beforeEach(() => start([done, tue]));

describe("the guard at the last step before the disk", () => {
  it("keeps a logged session when a save writes a planned copy over it - whatever wrote it", async () => {
    const heard = vi.fn();
    setGuardListener(heard);
    _dbState.workouts = [stale, tue];
    await flushDB(["workouts"]);
    expect(onDisk().map((w) => w.id).sort()).toEqual(["mon", "tue"]);
    expect(onDisk().filter((w) => w.id === "mon")).toEqual([expect.objectContaining({ status: "completed", loadFactor: 759 })]);
    await new Promise((r) => setTimeout(r, 0));
    expect(heard).toHaveBeenCalledWith([{ id: "mon", label: expect.stringContaining("Hypertrophy A") }]);
    const guard = (await readDataLog()).find((e) => e.kind === "guard");
    expect(guard?.msg).toMatch(/Refused to turn logged session mon/);
    expect(guard?.data).toEqual({ kept: done, attempted: stale });
  });

  it("also covers a whole-database save (sync, migrations, plan changes)", async () => {
    _dbState.workouts = [tue, stale];
    await flushDB();
    expect(onDisk().find((w) => w.id === "mon")?.status).toBe("completed");
  });

  it("lets a backup restore replace a logged session on purpose", async () => {
    await dataOp("restore", async () => {
      _dbState.workouts = [stale, tue];
      await flushDB();
    }, { allowUnlog: true });
    expect(onDisk().find((w) => w.id === "mon")?.status).toBe("planned");
    expect((await readDataLog()).some((e) => e.kind === "guard")).toBe(false);
  });

  it("lets a logged session be deleted, and keeps it whole in the log", async () => {
    _dbState.workouts = [tue];
    await flushDB(["workouts"]);
    expect(onDisk().map((w) => w.id)).toEqual(["tue"]);
    const kept = (await readDataLog()).find((e) => /Logged session mon .* was deleted/.test(e.msg));
    expect(kept?.data).toEqual(done);
  });
});

describe("what the log records", () => {
  it("the load, each save with its changes and the operation it was part of, and the disk write", async () => {
    await dataOp("finish session", async () => {
      _dbState.workouts = [done, { ...tue, status: "completed", date: "2026-11-24T08:00:00.000Z" }];
      await flushDB(["workouts"]);
    });
    const log = await readDataLog();
    expect(log[0]).toMatchObject({ kind: "load", msg: expect.stringMatching(/^Loaded the database file: data 3\.39, 2 sessions \(1 logged\)/) });
    expect(log.find((e) => e.kind === "write")).toMatchObject({ msg: "workouts: +0 ~1 -0 (now 2); status tue planned→completed", ops: ["finish session"] });
    expect(log.find((e) => e.kind === "disk")?.msg).toMatch(/^Database file written: \d+ KB, 2 sessions/);
  });

  it("a save that changed nothing writes no change line", async () => {
    await flushDB(["workouts"]);
    expect((await readDataLog()).filter((e) => e.kind === "write")).toEqual([]);
  });

  it("survives a restart: the file is read back in front of what comes after", async () => {
    recordData("session", "Session started: mon");
    await flushDataLog();
    expect(files.get(LOG)).toMatch(/Session started: mon/);
    resetDataLogForTests();
    recordData("session", "after restart");
    const log = await readDataLog();
    expect(log.map((e) => e.msg)).toEqual(expect.arrayContaining(["Session started: mon", "after restart"]));
    expect(log.findIndex((e) => e.msg === "Session started: mon")).toBeLessThan(log.findIndex((e) => e.msg === "after restart"));
  });
});

describe("saves that are not written", () => {
  it("leave a line even while the example data is open (when nothing else is logged)", async () => {
    setDemoMode(true);
    await flushDB(["workouts"]);
    setDemoMode(false);
    expect((await readDataLog()).some((e) => e.kind === "disk" && e.msg === "Save NOT written (the example data is open): workouts")).toBe(true);
  });

  it("and before the data is loaded", async () => {
    setDbState(null);
    await flushDB();
    expect((await readDataLog()).some((e) => /Save NOT written \(the data isn't loaded yet\): everything/.test(e.msg))).toBe(true);
  });
});

describe("parseLogLines", () => {
  it("skips a line cut off mid-write and lets a re-added line replace the one before", () => {
    const text = [
      JSON.stringify({ at: "2026-11-23T18:00:00.000Z", kind: "call", msg: "getWorkouts()" }),
      JSON.stringify({ at: "2026-11-23T18:00:03.000Z", kind: "call", msg: "getWorkouts()", n: 3, r: 1 }),
      '{"at":"2026-11-23T18:01',
    ].join("\n");
    expect(parseLogLines(text)).toEqual([{ at: "2026-11-23T18:00:03.000Z", kind: "call", msg: "getWorkouts()", n: 3 }]);
  });
});

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
import { log, logOp, flushLog, readLog, resetLogForTests } from "../log";
import { parseLogLines, resetLogStoreForTests, LOG_FILE } from "../log/store";
import { resetDataWatchForTests, setGuardListener } from "./dataWatch";

const DB = "DATA/boulder_tracker_db.json";
const LOG = `DATA/${LOG_FILE}`;
const done = { id: "mon", status: "completed", weekId: "2026-W48", date: "2026-11-23T20:22:10.000Z", notes: "Hypertrophy A", loadFactor: 759, exercises: [] };
const stale = { id: "mon", status: "planned", weekId: "2026-W48", dayOfWeek: "Monday", date: null, notes: "Hypertrophy A", loadFactor: 0, exercises: [] };
const tue = { id: "tue", status: "planned", weekId: "2026-W48", date: null, exercises: [] };

const onDisk = () => JSON.parse(files.get(DB)!).workouts as { id: string; status: string }[];

async function start(workouts: unknown[]) {
  files.clear();
  files.set(DB, JSON.stringify({ workouts, exportVersion: "3.39" }));
  resetLogStoreForTests();
  resetLogForTests();
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
    const guard = (await readLog()).find((e) => e.level === "warn" && e.area === "data");
    expect(guard?.msg).toMatch(/Refused to turn logged session mon/);
    expect(guard?.data).toEqual({ kept: done, attempted: stale });
  });

  it("also covers a whole-database save (sync, migrations, plan changes)", async () => {
    _dbState.workouts = [tue, stale];
    await flushDB();
    expect(onDisk().find((w) => w.id === "mon")?.status).toBe("completed");
  });

  it("lets a backup restore replace a logged session on purpose", async () => {
    await logOp("restore", async () => {
      _dbState.workouts = [stale, tue];
      await flushDB();
    }, { allowUnlog: true });
    expect(onDisk().find((w) => w.id === "mon")?.status).toBe("planned");
    expect((await readLog()).some((e) => e.level === "warn")).toBe(false);
  });

  it("lets a logged session be deleted, and keeps it whole in the log", async () => {
    _dbState.workouts = [tue];
    await flushDB(["workouts"]);
    expect(onDisk().map((w) => w.id)).toEqual(["tue"]);
    const kept = (await readLog()).find((e) => /Logged session mon .* was deleted/.test(e.msg));
    expect(kept?.data).toEqual(done);
  });
});

describe("what the log records", () => {
  it("the load, each save with its changes and the operation it was part of, and the disk write", async () => {
    await logOp("finish session", async () => {
      _dbState.workouts = [done, { ...tue, status: "completed", date: "2026-11-24T08:00:00.000Z" }];
      await flushDB(["workouts"]);
    });
    const entries = await readLog();
    expect(entries[0]).toMatchObject({ level: "info", area: "data", msg: expect.stringMatching(/^Loaded the database file: data 3\.39, 2 sessions \(1 logged\)/) });
    expect(entries.find((e) => e.area === "data" && e.level === "info" && e.msg.startsWith("workouts:"))).toMatchObject({ msg: "workouts: +0 ~1 -0 (now 2); status tue planned→completed", ops: ["finish session"] });
    expect(entries.find((e) => e.level === "debug" && /^Database file written/.test(e.msg))?.msg).toMatch(/^Database file written: \d+ KB, 2 sessions/);
  });

  it("a save that changed nothing writes no change line", async () => {
    await flushDB(["workouts"]);
    expect((await readLog()).filter((e) => e.msg.startsWith("workouts:"))).toEqual([]);
  });

  it("survives a restart: the file is read back in front of what comes after", async () => {
    log.info("session", "Session started: mon");
    await flushLog();
    expect(files.get(LOG)).toMatch(/Session started: mon/);
    resetLogStoreForTests();
    log.info("session", "after restart");
    const entries = await readLog();
    expect(entries.map((e) => e.msg)).toEqual(expect.arrayContaining(["Session started: mon", "after restart"]));
    expect(entries.findIndex((e) => e.msg === "Session started: mon")).toBeLessThan(entries.findIndex((e) => e.msg === "after restart"));
  });
});

describe("saves that are not written", () => {
  it("leave a line even while the example data is open (when nothing else is logged)", async () => {
    setDemoMode(true);
    await flushDB(["workouts"]);
    setDemoMode(false);
    expect((await readLog()).some((e) => e.level === "debug" && e.msg === "Save NOT written (the example data is open): workouts")).toBe(true);
  });

  it("and before the data is loaded", async () => {
    setDbState(null);
    await flushDB();
    expect((await readLog()).some((e) => e.level === "error" && /Save NOT written \(the data isn't loaded yet\): everything/.test(e.msg))).toBe(true);
  });
});

describe("parseLogLines", () => {
  it("skips a line cut off mid-write and lets a re-added line replace the one before", () => {
    const text = [
      JSON.stringify({ at: "2026-11-23T18:00:00.000Z", level: "debug", area: "data", msg: "getWorkouts()" }),
      JSON.stringify({ at: "2026-11-23T18:00:03.000Z", level: "debug", area: "data", msg: "getWorkouts()", n: 3, r: 1 }),
      '{"at":"2026-11-23T18:01',
    ].join("\n");
    expect(parseLogLines(text)).toEqual([{ at: "2026-11-23T18:00:03.000Z", level: "debug", area: "data", msg: "getWorkouts()", n: 3 }]);
  });
});

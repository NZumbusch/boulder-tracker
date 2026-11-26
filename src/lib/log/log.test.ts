import { describe, it, expect, vi, beforeEach } from "vitest";

// An in-memory Android filesystem, localStorage and toast.
const { files, fs, toastShow } = vi.hoisted(() => {
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
  };
  return { files, fs, toastShow: vi.fn() };
});
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/filesystem", () => ({ Directory: { Data: "DATA" }, Encoding: { UTF8: "utf8" }, Filesystem: fs }));
vi.mock("localforage", () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(), removeItem: vi.fn() } }));
vi.mock("../toast.svelte", () => ({ toast: { show: toastShow } }));
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) });

import { log, logOp, logCalls, readLog, flushLog, clearLog, setLogPaused, reportError, recentProblems, setAlertLevel, resetLogForTests } from "./index";
import { resetLogStoreForTests, LOG_FILE } from "./store";
import { LOG_MAX, TRIM_MARGIN } from "./entry";

const FILE = `DATA/${LOG_FILE}`;
const restart = () => { resetLogStoreForTests(); resetLogForTests(); };

beforeEach(() => {
  files.clear();
  storage.clear();
  toastShow.mockClear();
  restart();
});

describe("keeping the log", () => {
  it("writes entries to its own file and reads them back after a restart, in order", async () => {
    log.info("session", "Live session started");
    log.warn("data", "Refused", { data: { id: "mon" } });
    await flushLog();
    expect(files.get(FILE)?.trim().split("\n")).toHaveLength(2);
    restart();
    log.info("app", "after restart");
    expect((await readLog()).map((e) => [e.level, e.area, e.msg])).toEqual([
      ["info", "session", "Live session started"],
      ["warn", "data", "Refused"],
      ["info", "app", "after restart"],
    ]);
  });

  it("a repeat folded into a written entry rewrites that line (count kept after a restart)", async () => {
    log.debug("data", "getWorkouts()");
    await flushLog();
    log.debug("data", "getWorkouts()");
    log.debug("data", "getWorkouts()");
    await flushLog();
    restart();
    expect((await readLog()).map((e) => [e.msg, e.n])).toEqual([["getWorkouts()", 3]]);
  });

  it("past its size it drops routine lines first and rewrites the file", async () => {
    log.error("data", "the one problem");
    for (let i = 0; i < LOG_MAX + TRIM_MARGIN + 5; i++) log.debug("data", `read ${i}`, { data: i });
    await flushLog();
    const kept = await readLog();
    expect(kept.length).toBeLessThanOrEqual(LOG_MAX);
    expect(kept[0].msg).toBe("the one problem");
    expect(files.get(FILE)!.trim().split("\n").length).toBe(kept.length);
  });

  it("clear empties it", async () => {
    log.info("app", "x");
    await clearLog();
    expect(await readLog()).toEqual([]);
    restart();
    expect(await readLog()).toEqual([]);
  });
});

describe("the logs before this one", () => {
  it("are moved in once, by time, and deleted", async () => {
    storage.set("boulder_tracker_error_log", JSON.stringify([{ at: "2026-11-24T10:00:05.000Z", level: "error", source: "uncaught", message: "boom" }]));
    storage.set("boulder_tracker_console_log", JSON.stringify([{ at: "2026-11-24T10:00:01.000Z", level: "log", message: "hello" }, { at: "2026-11-24T10:00:05.000Z", level: "error", message: "boom" }]));
    files.set("DATA/boulder_tracker_data_log.jsonl", [
      JSON.stringify({ at: "2026-11-24T10:00:03.000Z", kind: "load", msg: "Loaded" }),
      JSON.stringify({ at: "2026-11-24T10:00:04.000Z", kind: "call", msg: "getWorkouts()" }),
      JSON.stringify({ at: "2026-11-24T10:00:04.500Z", kind: "call", msg: "getWorkouts()", n: 2, r: 1 }),
    ].join("\n") + "\n");
    log.info("app", "App started");
    const entries = await readLog();
    expect(entries.map((e) => [e.level, e.area, e.msg, e.n ?? 1])).toEqual([
      ["info", "console", "hello", 1],
      ["info", "data", "Loaded", 1],
      ["debug", "data", "getWorkouts()", 2],
      ["error", "console", "boom", 1],
      ["info", "app", "App started", 1],
    ]);
    expect(storage.has("boulder_tracker_error_log")).toBe(false);
    expect(storage.has("boulder_tracker_console_log")).toBe(false);
    expect(files.has("DATA/boulder_tracker_data_log.jsonl")).toBe(false);
    await flushLog();
    restart();
    expect((await readLog()).map((e) => e.msg)).toEqual(["hello", "Loaded", "getWorkouts()", "boom", "App started"]);
  });
});

describe("recording", () => {
  it("labels entries with the operations running, and lets restores through the guard", async () => {
    const { unlogAllowed, currentOps } = await import("./index");
    await logOp("rate and save session", async () => {
      await logOp("saveWorkout", async () => {
        log.info("data", "workouts: +0 ~1 -0");
        expect(unlogAllowed()).toBe(false);
      });
    });
    await logOp("restore", async () => expect(unlogAllowed()).toBe(true), { allowUnlog: true });
    expect(currentOps()).toEqual([]);
    expect((await readLog())[0].ops).toEqual(["rate and save session", "saveWorkout"]);
  });

  it("logCalls logs every call; a change runs as an operation, a read doesn't; a failure is an error", async () => {
    const target = {
      async getWorkouts() { log.info("data", "inside read"); return []; },
      async saveWorkout(_w: unknown) { log.info("data", "inside save"); },
      async deleteWorkout() { throw new Error("nope"); },
      async _plumbing() { return 1; },
    };
    const s = logCalls(target, "data");
    await s.getWorkouts();
    await s.saveWorkout({ id: "w1", status: "completed" });
    await expect(s.deleteWorkout()).rejects.toThrow("nope");
    await s._plumbing();
    expect((await readLog()).map((e) => [e.level, e.msg, e.ops?.join(">") ?? ""])).toEqual([
      ["debug", "getWorkouts()", ""],
      ["info", "inside read", ""],
      ["debug", "saveWorkout({id=w1 completed})", ""],
      ["info", "inside save", "saveWorkout"],
      ["debug", "deleteWorkout()", ""],
      ["error", "deleteWorkout failed: nope", ""],
    ]);
  });

  it("is paused while the example data is open, except for forced entries", async () => {
    setLogPaused(true);
    log.info("data", "example edit");
    log.debug("data", "Save NOT written (the example data is open)", { force: true });
    setLogPaused(false);
    expect((await readLog()).map((e) => e.msg)).toEqual(["Save NOT written (the example data is open)"]);
  });

  it("reportError logs an error and pops it up by the setting; the newest problems come first for a bug report", async () => {
    reportError(new Error("Create failed"), "Create exercise");
    expect(toastShow).toHaveBeenCalledWith("Something went wrong: Create failed");
    setAlertLevel("off");
    reportError(new Error("quiet"));
    expect(toastShow).toHaveBeenCalledTimes(1);
    log.info("app", "not a problem");
    log.warn("sync", "Drive sync: no ledger");
    expect((await recentProblems(5)).map((e) => e.msg)).toEqual(["Drive sync: no ledger", "quiet", "Create failed"]);
    expect((await readLog())[0]).toMatchObject({ level: "error", area: "console", where: "Create exercise", source: "caught" });
  });
});

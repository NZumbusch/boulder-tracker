import { describe, it, expect, vi, beforeEach } from "vitest";

// A tiny in-memory Android filesystem: files by "DIR/path". `failAfter`
// makes a write stop half-way, as when Android kills the app mid-save.
const { files, fs } = vi.hoisted(() => {
  const files = new Map<string, string>();
  const key = (directory: string, path: string) => `${directory}/${path}`;
  const fs = {
    killNextWriteTo: null as string | null,
    readFile: async ({ path, directory }: { path: string; directory: string }) => {
      const data = files.get(key(directory, path));
      if (data === undefined) throw new Error("File does not exist");
      return { data };
    },
    writeFile: async ({ path, directory, data }: { path: string; directory: string; data: string }) => {
      if (fs.killNextWriteTo === path) {
        fs.killNextWriteTo = null;
        files.set(key(directory, path), data.slice(0, Math.floor(data.length / 2)));
        throw new Error("killed mid-write");
      }
      files.set(key(directory, path), data);
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
    readdir: async ({ path, directory }: { path: string; directory: string }) => {
      const prefix = key(directory, `${path}/`);
      const names = [...files.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
      if (names.length === 0) throw new Error("No folder");
      return { files: names.map((name) => ({ name })) };
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
vi.mock("localforage", () => ({ default: { config: vi.fn(), getItem: vi.fn(async () => null), setItem: vi.fn() } }));

import { initDB, flushDB, setDbState, _dbState, takeRecoveryNotice } from "./persistence";

const DB = "DATA/boulder_tracker_db.json";
const TMP = "DATA/boulder_tracker_db.json.tmp";
const db = (n: number) => JSON.stringify({ workouts: [{ id: `w${n}` }], exportVersion: "3.30" });
const loadedIds = () => (_dbState.workouts as { id: string }[]).map((w) => w.id);

async function reload() {
  setDbState(null);
  await initDB();
}

beforeEach(() => {
  files.clear();
  fs.killNextWriteTo = null;
  takeRecoveryNotice();
});

describe("saving on Android", () => {
  it("writes the whole file aside and swaps it in - nothing is left behind", async () => {
    files.set(DB, db(1));
    await reload();
    _dbState.workouts.push({ id: "w2" });
    await flushDB();
    expect(JSON.parse(files.get(DB)!).workouts.map((w: { id: string }) => w.id)).toEqual(["w1", "w2"]);
    expect(files.has(TMP)).toBe(false);
  });

  it("killed while writing: the real file still holds the previous save", async () => {
    files.set(DB, db(1));
    await reload();
    _dbState.workouts.push({ id: "w2" });
    fs.killNextWriteTo = "boulder_tracker_db.json.tmp";
    await flushDB();
    await reload();
    expect(loadedIds()).toEqual(["w1"]);
    expect(takeRecoveryNotice()).toBeNull();
  });

  it("killed between removing the old file and swapping in the new one: the new save is found and put in place", async () => {
    files.set(TMP, db(2)); // complete save, old file already removed
    await reload();
    expect(loadedIds()).toEqual(["w2"]);
    expect(files.has(DB)).toBe(true);
    expect(takeRecoveryNotice()).toBeNull();
  });
});

describe("a damaged database", () => {
  it("is never replaced by an empty start: it's kept aside and the newest automatic backup is restored", async () => {
    files.set(DB, db(9).slice(0, 20)); // half-written
    files.set("DOCUMENTS/BoulderTracker/auto-backup-2026-09-13.json", db(3));
    files.set("DOCUMENTS/BoulderTracker/auto-backup-2026-09-20.json", db(4));
    await reload();
    expect(loadedIds()).toEqual(["w4"]);
    // The restored data is the database now...
    expect(JSON.parse(files.get(DB)!).workouts[0].id).toBe("w4");
    // ...and the damaged bytes are still there.
    const kept = [...files.keys()].find((k) => k.includes("damaged"));
    expect(kept && files.get(kept)).toBe(db(9).slice(0, 20));
    expect(takeRecoveryNotice()).toMatch(/restored from the automatic backup of 2026-09-20/);
  });

  it("skips a backup that is damaged too", async () => {
    files.set(DB, "{ not json");
    files.set("DOCUMENTS/BoulderTracker/auto-backup-2026-09-13.json", db(3));
    files.set("DOCUMENTS/BoulderTracker/auto-backup-2026-09-20.json", "{ also broken");
    await reload();
    expect(loadedIds()).toEqual(["w3"]);
  });

  it("with no backup at all, says so and still keeps the damaged file", async () => {
    files.set(DB, "{ not json");
    await reload();
    expect(loadedIds()).toEqual([]);
    expect([...files.keys()].some((k) => k.includes("damaged"))).toBe(true);
    expect(takeRecoveryNotice()).toMatch(/no automatic backup was found/);
  });

  it("a fresh install (no file at all) is not a recovery", async () => {
    await reload();
    expect(loadedIds()).toEqual([]);
    expect(takeRecoveryNotice()).toBeNull();
  });

  it("also finds backups in the folder from before the rename, and takes the newest across both", async () => {
    files.set(DB, "{ not json");
    files.set("DOCUMENTS/ClimbingTracker/auto-backup-2026-09-20.json", db(5));
    files.set("DOCUMENTS/BoulderTracker/auto-backup-2026-09-13.json", db(3));
    await reload();
    expect(loadedIds()).toEqual(["w5"]);
    files.set(DB, "{ not json");
    files.set("DOCUMENTS/BoulderTracker/auto-backup-2026-09-27.json", db(6));
    await reload();
    expect(loadedIds()).toEqual(["w6"]);
  });
});

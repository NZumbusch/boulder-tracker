import { describe, it, expect, vi, beforeEach } from "vitest";

const { files, docsFail } = vi.hoisted(() => ({ files: new Map<string, string>(), docsFail: { on: false } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/share", () => ({ Share: { share: vi.fn() } }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA", Documents: "DOCUMENTS", External: "EXTERNAL", Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    readFile: vi.fn(async () => { throw new Error("none"); }),
    writeFile: vi.fn(async ({ path, directory, data }: { path: string; directory: string; data: string }) => {
      if (directory === "DOCUMENTS" && docsFail.on) throw new Error("permission denied");
      files.set(`${directory}/${path}`, data);
      return { uri: `file://${directory}/${path}` };
    }),
    readdir: vi.fn(async ({ path, directory }: { path: string; directory: string }) => ({
      files: [...files.keys()].filter((k) => k.startsWith(`${directory}/${path}/`)).map((k) => ({ name: k.split("/").pop()! })),
    })),
    deleteFile: vi.fn(async ({ path, directory }: { path: string; directory: string }) => { files.delete(`${directory}/${path}`); }),
    mkdir: vi.fn(async () => {}),
  },
}));
vi.mock("localforage", () => ({ default: { config: vi.fn(), getItem: vi.fn(async () => null), setItem: vi.fn() } }));

import { autoBackupDue, backupsToPrune, writeAutoBackup } from "./autoBackup";
import { setDbState } from "./persistence";

describe("autoBackupDue", () => {
  const now = new Date("2026-09-23T10:00:00Z");
  it("is due with no backup yet, or one a week old", () => {
    expect(autoBackupDue(undefined, now)).toBe(true);
    expect(autoBackupDue("2026-09-16T10:00:00Z", now)).toBe(true);
    expect(autoBackupDue("2026-09-17T10:00:00Z", now)).toBe(false);
  });
});

describe("backupsToPrune", () => {
  it("keeps the newest few automatic backups and ignores other files", () => {
    const names = ["auto-backup-2026-08-01.json", "auto-backup-2026-09-01.json", "auto-backup-2026-08-15.json", "notes.txt", "auto-backup-2026-09-15.json", "auto-backup-2026-09-22.json"];
    expect(backupsToPrune(names, 4)).toEqual(["auto-backup-2026-08-01.json"]);
  });
});

describe("writeAutoBackup", () => {
  beforeEach(() => {
    files.clear();
    docsFail.on = false;
    setDbState({ workouts: [{ id: "w1" }], exportVersion: "3.29" });
  });

  it("writes today's backup to Documents/BoulderTracker and prunes old ones", async () => {
    for (const d of ["2026-08-01", "2026-08-15", "2026-09-01", "2026-09-15"]) files.set(`DOCUMENTS/BoulderTracker/auto-backup-${d}.json`, "{}");
    const where = await writeAutoBackup(new Date("2026-09-23T10:00:00Z"));
    expect(where).toBe("Documents/BoulderTracker");
    const saved = JSON.parse(files.get("DOCUMENTS/BoulderTracker/auto-backup-2026-09-23.json")!);
    expect(saved.workouts).toEqual([{ id: "w1" }]);
    expect([...files.keys()].sort()).toEqual([
      "DOCUMENTS/BoulderTracker/auto-backup-2026-08-15.json",
      "DOCUMENTS/BoulderTracker/auto-backup-2026-09-01.json",
      "DOCUMENTS/BoulderTracker/auto-backup-2026-09-15.json",
      "DOCUMENTS/BoulderTracker/auto-backup-2026-09-23.json",
    ]);
  });

  it("falls back to the app's own storage when Documents can't be written", async () => {
    docsFail.on = true;
    const where = await writeAutoBackup(new Date("2026-09-23T10:00:00Z"));
    expect(where).toBe("app storage");
    expect(files.has("EXTERNAL/BoulderTracker/auto-backup-2026-09-23.json")).toBe(true);
  });
});

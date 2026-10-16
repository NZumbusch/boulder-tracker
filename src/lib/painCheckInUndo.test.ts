import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, confirms } = vi.hoisted(() => ({ db: {} as Record<string, unknown>, confirms: [] as string[][] }));
vi.mock("localforage", () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async (k: string) => (k in db ? structuredClone(db[k]) : null)),
    setItem: vi.fn(async (k: string, v: unknown) => { db[k] = structuredClone(v); }),
    removeItem: vi.fn(async (k: string) => { delete db[k]; }),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("./utils", async (orig) => ({
  ...(await orig<typeof import("./utils")>()),
  showConfirm: vi.fn(async (title: string, text: string) => { confirms.push([title, text]); return false; }),
}));

import { trainingState } from "./state.svelte";
import { toast } from "./toast.svelte";
import { DATA_EXPORT_VERSION } from "./constants";
import { setDbState } from "./storage/persistence";

beforeEach(async () => {
  confirms.length = 0;
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, {
    database_version: DATA_EXPORT_VERSION,
    painIssues: [{ id: "i1", bodyPart: "Shoulder", startDate: "2026-09-01" }],
    painLogs: [{ id: "p1", date: "2026-09-02", weekId: "2026-W36", bodyPart: "Shoulder", severity: 4, issueId: "i1" }],
  });
  setDbState(null);
  await trainingState.refresh();
});

describe("a pain check-in can be undone", () => {
  for (const trend of ["better", "same", "worse", "gone"] as const) {
    it(`${trend}: logged, then taken back from the toast`, async () => {
      await trainingState.checkInPain("i1", trend, {}, "2026-09-10");
      expect(trainingState.painLogs).toHaveLength(2);
      expect(toast.current?.action?.label).toBe("Undo");
      expect(toast.current?.text).toContain("Shoulder");
      await toast.current!.action!.run();
      expect(trainingState.painLogs.map((l) => l.id)).toEqual(["p1"]);
      expect(trainingState.painIssues.find((i) => i.id === "i1")?.endDate).toBeUndefined();
    });
  }
});

describe("clearing a week", () => {
  it("names the week in words, not by its id", async () => {
    await trainingState.clearWeek("2026-W42");
    expect(confirms).toHaveLength(1);
    expect(confirms[0][1]).toContain("Week 42");
    expect(confirms[0][1]).not.toContain("2026-W42");
  });
});

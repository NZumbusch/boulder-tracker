import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./migrations";
import { DATA_EXPORT_VERSION } from "../constants";

describe("3.32 -> 3.33: pain entries grouped into issues", () => {
  it("adds an empty painIssues table when there's no pain", () => {
    const data: any = { exportVersion: "3.32", workouts: [], exerciseTypes: [], painLogs: [] };
    runDataMigrations(data);
    expect(data.exportVersion).toBe(DATA_EXPORT_VERSION);
    expect(data.painIssues).toEqual([]);
  });

  it("groups existing entries into issues and links every entry, keeping its fields", () => {
    const painLogs = [
      { id: "a", date: "2026-05-01", weekId: "2026-W18", bodyPart: "Knee", severity: 6, notes: "fell" },
      { id: "b", date: "2026-05-03", weekId: "2026-W18", bodyPart: "knee", severity: 3 },
      { id: "c", date: "2026-09-20", weekId: "2026-W38", bodyPart: "Left A2", severity: 4 },
    ];
    const data: any = { exportVersion: "3.32", workouts: [], exerciseTypes: [], painLogs: structuredClone(painLogs) };
    runDataMigrations(data);
    expect(data.painIssues).toHaveLength(2);
    expect(data.painLogs).toHaveLength(3);
    for (const l of data.painLogs) {
      const original = painLogs.find((p) => p.id === l.id)!;
      expect(l).toEqual({ ...original, issueId: expect.any(String) });
    }
    const knee = data.painIssues.find((i: any) => i.bodyPart === "Knee");
    expect(knee).toMatchObject({ startDate: "2026-05-01", endDate: "2026-05-03", endEstimated: true });
    expect(data.painIssues.find((i: any) => i.bodyPart === "Left A2").endDate).toBeUndefined();
  });

  it("keeps a painIssues table that's already there", () => {
    const data: any = { exportVersion: "3.32", workouts: [], exerciseTypes: [], painLogs: [{ id: "a", date: "2026-09-01", weekId: "x", bodyPart: "A", severity: 2, issueId: "i" }], painIssues: [{ id: "i", bodyPart: "A", startDate: "2026-09-01" }] };
    runDataMigrations(data);
    expect(data.painIssues).toEqual([{ id: "i", bodyPart: "A", startDate: "2026-09-01" }]);
  });
});

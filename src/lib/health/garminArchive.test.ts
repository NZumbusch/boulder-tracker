import { describe, expect, it } from "vitest";
import { applyArchive, archiveInfo, archiveRecords, archiveSourceFor, collapseRecords, planArchive } from "./garminArchive";
import { readActivityFile } from "../importers/activityFiles";
import { makeZip } from "../activity/zipBuilder.testutil";

const file = (name: string, data: string | Uint8Array) => Object.assign(new Blob([data as BlobPart]), { name });

describe("which files are kept", () => {
  it("keeps the data files by name, wherever they sit, and nothing about who you are or where", () => {
    for (const name of ["a@b.de_1_summarizedActivities.json", "UDSFile_2026-01-01_2026-04-01.json", "DI_CONNECT/x/2026-01-01_2026-04-01_9_sleepData.json", "x_healthStatusData.json", "MetricsMaxMetData_1_2_3.json", "Garmin_Coach_Pause_History.json"]) {
      expect(archiveSourceFor(name), name).toBeDefined();
    }
    for (const name of ["user_profile.json", "user_contact.json", "a@b.de-social-profile.json", "customer.json", "consentHistory.json", "devicesandcontent.json", "a@b.de_courses_1.json", "events.json", "x.fit"]) {
      expect(archiveSourceFor(name), name).toBeUndefined();
    }
  });
});

describe("records of a file", () => {
  it("names a day's row by its day, an activity by its id, and keeps the row exactly", () => {
    const row = { calendarDate: "2026-10-01", totalSteps: 9000, nested: { a: [1, 2] } };
    expect(archiveRecords("UDSFile_x.json", [row])).toEqual([{ id: "day:2026-10-01", kind: "day", key: "2026-10-01", data: row }]);
    const activity = { activityId: 123, name: "x" };
    expect(archiveRecords("a_summarizedActivities.json", [{ summarizedActivitiesExport: [activity] }])).toEqual([{ id: "activity:123", kind: "activity", key: "123", data: activity }]);
  });

  it("unwraps files that wrap their rows, with a kind for each part", () => {
    const records = archiveRecords("a_workout.json", [{ workoutList: [{ workoutId: 1 }], workoutScheduleList: [{ scheduleId: 2 }] }]);
    expect(records.map((r) => r.id)).toEqual(["workout:1", "workoutSchedule:2"]);
  });

  it("names a row with nothing that names it by its content, so the same row is one record", () => {
    const a = archiveRecords("a_nutritionLogs.json", [{ food: "x", kcal: 100 }]);
    const b = archiveRecords("a_nutritionLogs.json", [{ kcal: 100, food: "x" }]);
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].id.startsWith("nutrition:#")).toBe(true);
    expect(archiveRecords("a_nutritionLogs.json", [{ food: "y", kcal: 100 }])[0].id).not.toBe(a[0].id);
  });

  it("keeps a single object file as one record and skips scalars and nulls", () => {
    expect(archiveRecords("x_heartRateZones.json", { sport: "DEFAULT", zone1Floor: 100 })).toHaveLength(1);
    expect(archiveRecords("x_sleepData.json", [null, 3, "x", []])).toEqual([]);
  });
});

describe("storing without duplicates", () => {
  const rec = (day: string, steps: number) => ({ id: `day:${day}`, kind: "day", key: day, data: { calendarDate: day, totalSteps: steps } });

  it("adds what is new, replaces what changed and leaves what is the same", () => {
    const have = [rec("2026-10-01", 100), rec("2026-10-02", 200)];
    const plan = planArchive(have, [rec("2026-10-02", 200), rec("2026-10-01", 150), rec("2026-10-03", 300)]);
    expect(plan.same).toBe(1);
    expect(plan.change.map((r) => r.id)).toEqual(["day:2026-10-01"]);
    expect(plan.add.map((r) => r.id)).toEqual(["day:2026-10-03"]);
    expect(applyArchive(have, plan).map((r) => [r.id, (r.data as any).totalSteps])).toEqual([["day:2026-10-01", 150], ["day:2026-10-02", 200], ["day:2026-10-03", 300]]);
  });

  it("is the same after importing the same export twice", () => {
    const incoming = [rec("2026-10-01", 100), rec("2026-10-02", 200)];
    const once = applyArchive([], planArchive([], incoming));
    const plan = planArchive(once, incoming);
    expect(plan).toEqual({ add: [], change: [], same: 2 });
    expect(applyArchive(once, plan)).toEqual(once);
  });

  it("reduces a day that two overlapping files both hold to the fuller row", () => {
    const thin = { id: "day:2026-10-01", kind: "day", key: "2026-10-01", data: { calendarDate: "2026-10-01" } };
    const full = { ...thin, data: { calendarDate: "2026-10-01", totalSteps: 5, restingHeartRate: 50 } };
    expect(collapseRecords([thin, full, thin])).toEqual([full]);
  });

  it("describes what is kept: records per kind, biggest first, and the size", () => {
    const info = archiveInfo([rec("2026-10-01", 1), rec("2026-10-02", 2), { id: "sleep:1", kind: "sleep", key: "1", data: {} }]);
    expect(info.records).toBe(3);
    expect(info.kinds).toEqual([{ kind: "day", records: 2 }, { kind: "sleep", records: 1 }]);
    expect(info.bytes).toBeGreaterThan(50);
    expect(archiveInfo([])).toEqual({ records: 0, kinds: [], bytes: 0 });
  });
});

describe("importing a Garmin export keeps its rows", () => {
  const zip = (extra: Record<string, string> = {}) => makeZip({
    "DI_CONNECT/DI-Connect-Aggregator/UDSFile_2026-01-01_2026-04-01.json": JSON.stringify([{ calendarDate: "2026-10-05", restingHeartRate: 50, totalSteps: 8000 }]),
    "DI_CONNECT/DI-Connect-Wellness/2026-01-01_2026-04-01_1_sleepData.json": JSON.stringify([{ calendarDate: "2026-10-05", deepSleepSeconds: 3600, lightSleepSeconds: 7200, sleepScores: { overallScore: 80 } }, { retro: true }]),
    "DI_CONNECT/DI-Connect-Fitness/x_1_summarizedActivities.json": JSON.stringify([{ summarizedActivitiesExport: [{ activityId: 9, startTimeGmt: Date.UTC(2026, 9, 5, 6, 30), activityType: "walking", duration: 1_800_000 }] }]),
    "DI_CONNECT/DI-Connect-User/user_profile.json": JSON.stringify({ name: "Someone", email: "x@y.z" }),
    ...extra,
  });

  it("holds the data files' rows as they were, and not the profile", async () => {
    const r = await readActivityFile(file("export.zip", zip()));
    const ids = r.archive.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["activity:9", "day:2026-10-05", "sleep:2026-10-05"]));
    // The sleep file's row without a night is kept too, named by its content.
    expect(ids.some((i) => i.startsWith("sleep:#"))).toBe(true);
    expect(ids).toHaveLength(4);
    expect(r.archive.find((a) => a.id === "day:2026-10-05")!.data).toEqual({ calendarDate: "2026-10-05", restingHeartRate: 50, totalSteps: 8000 });
    expect(JSON.stringify(r.archive)).not.toContain("Someone");
  });

  it("makes no new records when the same export comes in a second time", async () => {
    const a = await readActivityFile(file("export.zip", zip()));
    const b = await readActivityFile(file("export.zip", zip()));
    const stored = applyArchive([], planArchive([], a.archive));
    expect(planArchive(stored, b.archive)).toMatchObject({ add: [], change: [] });
    expect(stored).toHaveLength(a.archive.length);
  });
});

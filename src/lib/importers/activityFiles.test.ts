import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { readActivityFile, readActivityFiles } from "./activityFiles";
import { makeZip } from "../activity/zipBuilder.testutil";
import { FitWriter, fitTime, semicircles, type FieldDef } from "../activity/fitBuilder.testutil";
import { decodeTrack } from "../activity/track";

const T0 = Date.UTC(2026, 9, 5, 6, 30, 0);
const REC: FieldDef[] = [
  { num: 253, size: 4, base: 0x86 }, { num: 0, size: 4, base: 0x85 }, { num: 1, size: 4, base: 0x85 }, { num: 3, size: 1, base: 0x02 },
];
const SESSION: FieldDef[] = [
  { num: 2, size: 4, base: 0x86 }, { num: 5, size: 1, base: 0x00 }, { num: 7, size: 4, base: 0x86 }, { num: 9, size: 4, base: 0x86 }, { num: 17, size: 1, base: 0x02 },
];

/** A 200 m northbound run starting at T0 + offset seconds, 100 s long. */
function fit(offset = 0, sport = 1): Uint8Array {
  const w = new FitWriter();
  w.define(0, 20, REC);
  for (let i = 0; i < 5; i++) w.data(0, REC, [fitTime(T0) + offset + i * 25, semicircles(46.5 + i * 0.0005), semicircles(7.5), 130 + i]);
  w.define(1, 18, SESSION);
  w.data(1, SESSION, [fitTime(T0) + offset, sport, 100_000, 20_000, 160]);
  return w.build();
}

const file = (name: string, data: Uint8Array | string) => Object.assign(new Blob([data as BlobPart]), { name });

const HEADER = "Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Private Note,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time,Moving Time,Distance";

describe("loose files", () => {
  it("reads a .fit with its route", async () => {
    const r = await readActivityFile(file("morning.fit", fit()));
    expect(r.skipped).toEqual([]);
    const [a] = r.activities;
    expect(a).toMatchObject({ source: "file", type: "Run", durationSec: 100, distanceM: 200, maxHr: 160, start: new Date(T0).toISOString() });
    expect(a.id).toBe(`file-${T0 / 1000}`);
    expect(decodeTrack(a.track!).length).toBeGreaterThanOrEqual(2);
  });

  it("reads gzipped .fit.gz, .gpx and .tcx", async () => {
    const gz = await readActivityFile(file("a.fit.gz", new Uint8Array(gzipSync(fit()))));
    expect(gz.activities).toHaveLength(1);
    const gpx = `<gpx><trk><name>Loop</name><trkseg><trkpt lat="46.5" lon="7.5"><time>2026-10-05T06:30:00Z</time></trkpt><trkpt lat="46.502" lon="7.5"><time>2026-10-05T06:35:00Z</time></trkpt></trkseg></trk></gpx>`;
    const g = (await readActivityFile(file("loop.gpx", gpx))).activities[0];
    expect(g).toMatchObject({ name: "Loop", type: "Activity", durationSec: 300 });
    expect(g.distanceM).toBeGreaterThan(200);
    const tcx = `<TrainingCenterDatabase><Activity Sport="Biking"><Trackpoint><Time>2026-10-05T07:00:00Z</Time></Trackpoint><Trackpoint><Time>2026-10-05T07:10:00Z</Time></Trackpoint></Activity></TrainingCenterDatabase>`;
    expect((await readActivityFile(file("ride.tcx", tcx))).activities[0]).toMatchObject({ type: "Ride", durationSec: 600 });
  });

  it("skips what holds no activity, with the reason", async () => {
    const r = await readActivityFile(file("empty.fit", new Uint8Array([1, 2, 3])));
    expect(r.activities).toEqual([]);
    expect(r.skipped[0].where).toBe("empty.fit");
    expect((await readActivityFile(file("notes.txt", "hi"))).skipped[0].reason).toContain("Not a");
  });
});

describe("a Strava archive", () => {
  const csv = `${HEADER}\n111,"Oct 5, 2026, 6:30:00 AM",Morning run,Run,,100,0.2,,,,,,activities/111.fit.gz,,,100.0,95.0,200.0\n222,"Oct 6, 2026, 6:30:00 AM",Gym,Weight Training,,3000,,,,,,,,,,3000.0,,\n`;
  const zip = makeZip({ "activities.csv": csv, "activities/111.fit.gz": new Uint8Array(gzipSync(fit())), "bikes.csv": "x" });

  it("takes names and numbers from the CSV and the route from the recording", async () => {
    const r = await readActivityFile(file("export.zip", zip));
    expect(r.skipped).toEqual([]);
    expect(r.activities.map((a) => a.id)).toEqual(["strava-111", "strava-222"]);
    const run = r.activities[0];
    expect(run).toMatchObject({ name: "Morning run", type: "Run", durationSec: 100, movingSec: 95, distanceM: 200, maxHr: 160 });
    expect(run.track).toBeTruthy();
    expect(r.activities[1].track).toBeUndefined();
  });

  it("keeps an activity whose recording is missing", async () => {
    const z = makeZip({ "activities.csv": csv });
    const r = await readActivityFile(file("export.zip", z));
    expect(r.activities).toHaveLength(2);
  });
});

describe("a Garmin-style export", () => {
  it("reads recordings, nested zips included, as garmin activities", async () => {
    const inner = makeZip({ "x_ACTIVITY.fit": fit(0), "y_ACTIVITY.fit": fit(86_400, 2) });
    const zip = makeZip({ "DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip": inner, "DI_CONNECT/readme.txt": "hi" });
    const r = await readActivityFile(file("export.zip", zip));
    expect(r.activities.map((a) => [a.source, a.type])).toEqual([["garmin", "Run"], ["garmin", "Ride"]]);
  });

  it("keeps an activity found in two files once", async () => {
    const r = await readActivityFiles([file("a.fit", fit()), file("b.fit", fit())]);
    expect(r.activities).toHaveLength(1);
  });
});

describe("a Garmin data export", () => {
  const FILE_ID: FieldDef[] = [{ num: 0, size: 1, base: 0x00 }, { num: 4, size: 4, base: 0x86 }];
  const HRV: FieldDef[] = [{ num: 253, size: 4, base: 0x86 }, { num: 0, size: 2, base: 0x84 }, { num: 1, size: 2, base: 0x84 }];

  /** An activity file: file_id type 4 first, then the usual records. */
  function activityFit(offset = 0): Uint8Array {
    const w = new FitWriter();
    w.define(2, 0, FILE_ID);
    w.data(2, FILE_ID, [4, fitTime(T0) + offset]);
    w.define(0, 20, REC);
    for (let i = 0; i < 5; i++) w.data(0, REC, [fitTime(T0) + offset + i * 25, semicircles(46.5 + i * 0.0005), semicircles(7.5), 130 + i]);
    w.define(1, 18, SESSION);
    w.data(1, SESSION, [fitTime(T0) + offset, 1, 100_000, 20_000, 160]);
    return w.build();
  }
  function hrvFit(): Uint8Array {
    const w = new FitWriter();
    w.define(2, 0, FILE_ID);
    w.data(2, FILE_ID, [68, fitTime(T0)]);
    w.define(1, 370, HRV);
    w.data(1, HRV, [fitTime(T0) + 3600, 80 * 128, 85 * 128]);
    return w.build();
  }
  const sleepNight = { calendarDate: "2026-10-05", deepSleepSeconds: 3600, lightSleepSeconds: 18000, remSleepSeconds: 3600, sleepScores: { overallScore: 80 } };

  const inner = makeZip({ "u_1.fit": activityFit(), "u_2.fit": hrvFit(), "u_3.fit": new Uint8Array([1, 2, 3]) });
  const summaries = [{ summarizedActivitiesExport: [
    { activityType: "running", startTimeGmt: T0 + 30_000, name: "Bern Running", duration: 100_000, distance: 20000 },
    { activityType: "badminton", startTimeGmt: T0 + 86_400_000, name: "Badminton", duration: 3_600_000 },
  ] }];
  const zip = makeZip({
    "DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip": inner,
    "DI_CONNECT/DI-Connect-Wellness/2025-09-21_2026-10-26_1_sleepData.json": JSON.stringify([sleepNight, { retro: true }]),
    "DI_CONNECT/DI-Connect-Aggregator/UDSFile_2026-07-17_2026-10-25.json": JSON.stringify([{ calendarDate: "2026-10-05", restingHeartRate: 50 }]),
    "DI_CONNECT/DI-Connect-Fitness/x_1_summarizedActivities.json": JSON.stringify(summaries),
  });

  it("reads activities, daily values and HRV from every part of the export", async () => {
    const r = await readActivityFile(file("export.zip", zip));
    expect(r.skipped).toEqual([]);
    const byId = Object.fromEntries(r.activities.map((a) => [a.type, a]));
    // The recording is named by its summary and keeps its route; the summary with no recording is an activity without one.
    expect(byId["Run"]).toMatchObject({ source: "garmin", name: "Bern Running", id: `garmin-${T0 / 1000}` });
    expect(byId["Run"].track).toBeTruthy();
    expect(byId["Badminton"]).toMatchObject({ source: "garmin", durationSec: 3600 });
    expect(byId["Badminton"].track).toBeUndefined();
    expect(r.activities).toHaveLength(2);
    const key = (v: { metricId: string }) => v.metricId;
    expect(r.daily.map(key).sort()).toEqual(["hrv", "rhr", "sleep-deep", "sleep-duration", "sleep-rem", "sleep-score"].sort());
    expect(r.daily.find((v) => v.metricId === "hrv")).toEqual({ metricId: "hrv", date: "2026-10-05", value: 85 });
    expect(r.daily.find((v) => v.metricId === "sleep-duration")?.value).toBe(7);
  });
});

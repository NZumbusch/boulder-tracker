import type { ExternalActivity } from "../types";
import { localIsoDate } from "../dateUtils";
import { fitFileType, fitSportName, readFitActivity, readFitHrv, type FitActivity, type FitPoint } from "../activity/fit";
import { readGpx, readTcx } from "../activity/gpxTcx";
import { routeOf, trackLength, type LatLon } from "../activity/track";
import { computeStats, mergeStats } from "../activity/stats";
import { inflate, isGzip, readZip, type ZipEntry } from "../activity/zip";
import { parseStravaCsv } from "./stravaCsvImport";
import type { DailyValue } from "../health/import";
import { garminDailyValues, parseSummarizedActivities, type GarminActivitySummary } from "../health/garminExport";

/**
 * Turns what a person has on disk into `ExternalActivity[]`:
 *  - a Strava archive (.zip, or its activities.csv alone): the CSV gives the
 *    names, types and numbers, each row's recording (FIT, GPX or TCX, often
 *    gzipped) adds the GPS route and fills what the CSV leaves out;
 *  - a Garmin export or any other .zip: every recording inside, including
 *    zips inside zips (Garmin's "uploaded files" are one);
 *  - loose .fit, .gpx, .tcx files, gzipped or not.
 * A recording that holds no activity is skipped with the reason, never fatal.
 */

export interface ActivityRead {
  activities: ExternalActivity[];
  skipped: { where: string; reason: string }[];
  /** Daily values (sleep, HRV, resting heart rate...) from a Garmin export. */
  daily: DailyValue[];
}

export type Progress = (done: number, total: number) => void;

type Source = ExternalActivity["source"];

const REC_EXT = /\.(fit|gpx|tcx)(\.gz)?$/i;
const nameOf = (path: string) => path.split("/").pop() ?? path;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function bytesOf(raw: Uint8Array): Promise<Uint8Array> {
  return isGzip(raw) ? inflate(raw, "gzip") : raw;
}

/** A decoded recording, whatever its format. */
interface Recording {
  fit?: FitActivity;
  name?: string;
  sport?: string;
  points: FitPoint[];
}

export async function decodeRecording(fileName: string, raw: Uint8Array): Promise<Recording | null> {
  const bytes = await bytesOf(raw);
  const ext = /\.(fit|gpx|tcx)(?:\.gz)?$/i.exec(fileName)?.[1].toLowerCase();
  if (ext === "fit") {
    const fit = readFitActivity(bytes);
    return fit ? { fit, points: fit.points } : null;
  }
  const text = new TextDecoder().decode(bytes);
  if (ext === "gpx") {
    const g = readGpx(text);
    return g ? { name: g.name, points: g.points } : null;
  }
  if (ext === "tcx") {
    const t = readTcx(text);
    return t ? { sport: t.sport, points: t.points } : null;
  }
  return null;
}

const TCX_SPORTS: Record<string, string> = { running: "Run", biking: "Ride", walking: "Walk", hiking: "Hike", swimming: "Swim" };

/** The numbers a recording gives, for an activity that has none of its own. */
function figures(rec: Recording, type: string) {
  const pts = rec.points;
  const line: LatLon[] = pts.filter((p) => p.lat !== undefined && p.lon !== undefined).map((p) => [p.lat!, p.lon!]);
  const startMs = rec.fit?.startMs ?? pts[0]?.t ?? NaN;
  const lastT = pts.length ? pts[pts.length - 1].t : startMs;
  const hrs = pts.map((p) => p.hr).filter((h): h is number => h !== undefined);
  let gain = 0;
  let prev: number | undefined;
  for (const p of pts) {
    if (p.alt === undefined) continue;
    if (prev !== undefined && p.alt - prev > 0.5) gain += p.alt - prev;
    prev = p.alt;
  }
  return {
    startMs,
    durationSec: Math.round(rec.fit?.elapsedSec ?? Math.max(0, (lastT - startMs) / 1000)),
    movingSec: rec.fit?.timerSec !== undefined ? Math.round(rec.fit.timerSec) : undefined,
    distanceM: rec.fit?.distanceM ?? (line.length > 1 ? trackLength(line) : undefined),
    elevationM: rec.fit?.ascentM ?? (gain > 0 ? gain : undefined),
    avgHr: rec.fit?.avgHr ?? (hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined),
    maxHr: rec.fit?.maxHr ?? (hrs.length ? Math.max(...hrs) : undefined),
    calories: rec.fit?.calories,
    track: routeOf(pts),
    stats: computeStats(pts, type, rec.fit),
  };
}

/** An activity from a recording alone (no CSV): a loose file or a Garmin export. */
export function activityFromRecording(rec: Recording, source: Source): ExternalActivity | null {
  const type = rec.fit ? fitSportName(rec.fit.sport, rec.fit.subSport) : TCX_SPORTS[(rec.sport ?? "").toLowerCase()] ?? "Activity";
  const f = figures(rec, type);
  if (!Number.isFinite(f.startMs)) return null;
  const epoch = Math.round(f.startMs / 1000);
  const out: ExternalActivity = {
    id: `${source}-${epoch}`,
    source,
    sourceId: String(epoch),
    date: localIsoDate(new Date(f.startMs)),
    start: new Date(f.startMs).toISOString(),
    name: rec.name || type,
    type,
    durationSec: f.durationSec,
  };
  fill(out, f);
  return out;
}

/** Adds what the recording knows and the activity does not. */
function fill(a: ExternalActivity, f: ReturnType<typeof figures>) {
  if (a.movingSec === undefined && f.movingSec) a.movingSec = f.movingSec;
  if (a.distanceM === undefined && f.distanceM) a.distanceM = Math.round(f.distanceM);
  if (a.elevationM === undefined && f.elevationM) a.elevationM = Math.round(f.elevationM);
  if (a.avgHr === undefined && f.avgHr) a.avgHr = f.avgHr;
  if (a.maxHr === undefined && f.maxHr) a.maxHr = f.maxHr;
  if (a.calories === undefined && f.calories) a.calories = f.calories;
  if (!a.durationSec && f.durationSec) a.durationSec = f.durationSec;
  if (f.track) a.track = f.track;
  if (f.stats) a.stats = mergeStats(a.stats, f.stats);
}

async function readStravaZip(entries: ZipEntry[], csv: ZipEntry, out: ActivityRead, progress?: Progress) {
  const parsed = parseStravaCsv(new TextDecoder().decode(await csv.read()));
  for (const s of parsed.skipped) out.skipped.push({ where: `activities.csv line ${s.line}`, reason: s.reason });
  const byPath = new Map(entries.map((e) => [e.name.replace(/^.*?(?=activities\/)/, ""), e]));
  let n = 0;
  for (const a of parsed.activities) {
    progress?.(n++, parsed.activities.length);
    const file = parsed.filenames[a.sourceId];
    const entry = file ? byPath.get(file) ?? byPath.get(file.replace(/^.*?(?=activities\/)/, "")) : undefined;
    if (entry) {
      try {
        const rec = await decodeRecording(entry.name, await entry.read());
        if (rec) fill(a, figures(rec, a.type));
      } catch (e) {
        out.skipped.push({ where: entry.name, reason: `Recording unreadable (${(e as Error).message}); kept without a route` });
      }
    }
    out.activities.push(a);
    if (n % 20 === 0) await tick();
  }
  progress?.(parsed.activities.length, parsed.activities.length);
}

async function readRecordings(entries: ZipEntry[], source: Source, out: ActivityRead, depth: number, progress?: Progress) {
  const recs = entries.filter((e) => REC_EXT.test(e.name));
  const zips = entries.filter((e) => /\.zip$/i.test(e.name));
  let n = 0;
  for (const e of recs) {
    progress?.(n++, recs.length);
    try {
      const rec = await decodeRecording(e.name, await e.read());
      const act = rec && activityFromRecording(rec, source);
      if (act) out.activities.push(act);
      else out.skipped.push({ where: nameOf(e.name), reason: "No activity in this recording" });
    } catch (err) {
      out.skipped.push({ where: nameOf(e.name), reason: (err as Error).message });
    }
    if (n % 20 === 0) await tick();
  }
  if (depth < 3) {
    for (const z of zips) {
      try {
        await readRecordings(await readZip(new Blob([(await z.read()) as BlobPart])), source, out, depth + 1);
      } catch (err) {
        out.skipped.push({ where: nameOf(z.name), reason: (err as Error).message });
      }
    }
  }
}

/** One picked file. */
export async function readActivityFile(file: Blob & { name: string }, progress?: Progress): Promise<ActivityRead> {
  const out: ActivityRead = { activities: [], skipped: [], daily: [] };
  const name = file.name;
  try {
    if (/\.zip$/i.test(name)) {
      const entries = await readZip(file);
      const csv = entries.find((e) => /(^|\/)activities\.csv$/i.test(e.name));
      if (csv) await readStravaZip(entries, csv, out, progress);
      else if (entries.some((e) => /(^|\/)DI_CONNECT\//i.test(e.name))) await readGarminExport(entries, out, progress);
      else await readRecordings(entries, "file", out, 0, progress);
    } else if (/\.csv$/i.test(name)) {
      const parsed = parseStravaCsv(await file.text());
      out.activities.push(...parsed.activities);
      for (const s of parsed.skipped) out.skipped.push({ where: `line ${s.line}`, reason: s.reason });
    } else if (REC_EXT.test(name)) {
      const rec = await decodeRecording(name, new Uint8Array(await file.arrayBuffer()));
      const act = rec && activityFromRecording(rec, "file");
      if (act) out.activities.push(act);
      else out.skipped.push({ where: name, reason: "No activity in this recording" });
    } else {
      out.skipped.push({ where: name, reason: "Not a .zip, .csv, .fit, .gpx or .tcx file" });
    }
  } catch (err) {
    out.skipped.push({ where: name, reason: (err as Error).message });
  }
  return out;
}

/** Several picked files; an activity found twice (same id) is kept once. */
export async function readActivityFiles(files: (Blob & { name: string })[], progress?: Progress): Promise<ActivityRead> {
  const all: ActivityRead = { activities: [], skipped: [], daily: [] };
  const seen = new Set<string>();
  for (const f of files) {
    const r = await readActivityFile(f, progress);
    for (const a of r.activities) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      all.activities.push(a);
    }
    all.skipped.push(...r.skipped);
    all.daily.push(...r.daily);
  }
  return all;
}

// --- Garmin data export ------------------------------------------------------

const dec = new TextDecoder();

async function jsonFiles(entries: ZipEntry[], pattern: RegExp, out: ActivityRead): Promise<any[]> {
  const rows: any[] = [];
  for (const e of entries.filter((x) => pattern.test(nameOf(x.name)))) {
    try {
      const data = JSON.parse(dec.decode(await e.read()));
      if (Array.isArray(data)) rows.push(...data);
    } catch (err) {
      out.skipped.push({ where: nameOf(e.name), reason: `Unreadable (${(err as Error).message})` });
    }
  }
  return rows;
}

/** Applies Garmin's own name, type and numbers where the recording has none. */
function applySummary(a: ExternalActivity, s: GarminActivitySummary) {
  if (s.name) a.name = s.name;
  a.type = s.type;
  if (!a.durationSec && s.durationSec) a.durationSec = s.durationSec;
  if (s.movingSec) a.movingSec = s.movingSec;
  if (!a.distanceM && s.distanceM) a.distanceM = s.distanceM;
  if (!a.elevationM && s.elevationM) a.elevationM = s.elevationM;
  if (!a.avgHr && s.avgHr) a.avgHr = s.avgHr;
  if (!a.maxHr && s.maxHr) a.maxHr = s.maxHr;
  if (!a.calories && s.calories) a.calories = s.calories;
  if (s.place && !a.notes) a.notes = s.place;
  const extra = { ...(s.trainingEffect ? { trainingEffect: s.trainingEffect } : {}), ...(s.anaerobicEffect ? { anaerobicEffect: s.anaerobicEffect } : {}), ...(s.trainingLoad ? { trainingLoad: s.trainingLoad } : {}) };
  if (Object.keys(extra).length) a.stats = mergeStats(a.stats, extra);
}

function activityFromSummary(s: GarminActivitySummary): ExternalActivity {
  const epoch = Math.round(s.startMs / 1000);
  const a: ExternalActivity = {
    id: `garmin-${epoch}`,
    source: "garmin",
    sourceId: String(epoch),
    date: localIsoDate(new Date(s.startMs)),
    start: new Date(s.startMs).toISOString(),
    name: s.name || s.type,
    type: s.type,
    durationSec: s.durationSec ?? 0,
  };
  applySummary(a, s);
  return a;
}

/**
 * A whole Garmin export: the daily wellness JSON (sleep, summaries, VO2max,
 * weight), the FIT files in the uploaded-files zips (activities with routes,
 * and the HRV-status nights) and the activity summaries (names, types).
 * Activities come from the recordings where there are any, else from the
 * summaries alone.
 */
async function readGarminExport(entries: ZipEntry[], out: ActivityRead, progress?: Progress) {
  const [summaries, sleep, healthStatus, maxMet, bio, summarizedFiles, readiness] = await Promise.all([
    jsonFiles(entries, /^UDSFile_.*\.json$/i, out),
    jsonFiles(entries, /_sleepData\.json$/i, out),
    jsonFiles(entries, /_healthStatusData\.json$/i, out),
    jsonFiles(entries, /^MetricsMaxMetData_.*\.json$/i, out),
    jsonFiles(entries, /_userBioMetrics\.json$/i, out),
    jsonFiles(entries, /_summarizedActivities\.json$/i, out),
    jsonFiles(entries, /TrainingReadiness.*\.json$/i, out),
  ]);

  const summaryList = parseSummarizedActivities(summarizedFiles);
  const fitHrv: { t: number; lastNight: number }[] = [];
  const recordings: ExternalActivity[] = [];
  const startOf = new Map<ExternalActivity, number>();

  // Recordings: every FIT in the (nested) uploaded-files zips; only activities and HRV status are read in full.
  const fitEntries: ZipEntry[] = [];
  const collect = async (list: ZipEntry[], depth: number) => {
    for (const e of list) {
      if (/\.fit(\.gz)?$/i.test(e.name)) fitEntries.push(e);
      else if (/\.zip$/i.test(e.name) && depth < 3) {
        try {
          await collect(await readZip(new Blob([(await e.read()) as BlobPart])), depth + 1);
        } catch (err) {
          out.skipped.push({ where: nameOf(e.name), reason: (err as Error).message });
        }
      }
    }
  };
  await collect(entries, 0);

  let n = 0;
  for (const e of fitEntries) {
    progress?.(n++, fitEntries.length);
    try {
      const bytes = await bytesOf(await e.read());
      const kind = fitFileType(bytes);
      if (kind === 68) fitHrv.push(...readFitHrv(bytes));
      else if (kind === 4 || kind === undefined) {
        const rec = await decodeRecording("a.fit", bytes);
        const act = rec && activityFromRecording(rec, "garmin");
        if (act) {
          recordings.push(act);
          startOf.set(act, Date.parse(act.start));
        }
      }
    } catch {
      // A damaged recording is not worth stopping for; the summaries still cover the activity.
    }
    if (n % 50 === 0) await tick();
  }
  progress?.(fitEntries.length, fitEntries.length);

  // Garmin's summaries name and type each recording; a summary with no recording is an activity without a route.
  const taken = new Set<GarminActivitySummary>();
  for (const a of recordings) {
    const s = summaryList.find((x) => !taken.has(x) && Math.abs(x.startMs - startOf.get(a)!) < 120_000);
    if (s) {
      taken.add(s);
      applySummary(a, s);
    }
    out.activities.push(a);
  }
  for (const s of summaryList) if (!taken.has(s)) out.activities.push(activityFromSummary(s));

  out.daily = garminDailyValues({ summaries, sleep, healthStatus, maxMet, bio, readiness, fitHrv });
}

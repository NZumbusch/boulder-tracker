import type { ExternalActivity } from "../types";
import { localIsoDate } from "../dateUtils";
import { fitSportName, readFitActivity, type FitActivity, type FitPoint } from "../activity/fit";
import { readGpx, readTcx } from "../activity/gpxTcx";
import { routeOf, trackLength, type LatLon } from "../activity/track";
import { inflate, isGzip, readZip, type ZipEntry } from "../activity/zip";
import { parseStravaCsv } from "./stravaCsvImport";

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
function figures(rec: Recording) {
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
  };
}

/** An activity from a recording alone (no CSV): a loose file or a Garmin export. */
export function activityFromRecording(rec: Recording, source: Source): ExternalActivity | null {
  const f = figures(rec);
  if (!Number.isFinite(f.startMs)) return null;
  const type = rec.fit ? fitSportName(rec.fit.sport, rec.fit.subSport) : TCX_SPORTS[(rec.sport ?? "").toLowerCase()] ?? "Activity";
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
        if (rec) fill(a, figures(rec));
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
  const out: ActivityRead = { activities: [], skipped: [] };
  const name = file.name;
  try {
    if (/\.zip$/i.test(name)) {
      const entries = await readZip(file);
      const csv = entries.find((e) => /(^|\/)activities\.csv$/i.test(e.name));
      if (csv) await readStravaZip(entries, csv, out, progress);
      else await readRecordings(entries, entries.some((e) => /DI_CONNECT/i.test(e.name)) ? "garmin" : "file", out, 0, progress);
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
  const all: ActivityRead = { activities: [], skipped: [] };
  const seen = new Set<string>();
  for (const f of files) {
    const r = await readActivityFile(f, progress);
    for (const a of r.activities) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      all.activities.push(a);
    }
    all.skipped.push(...r.skipped);
  }
  return all;
}

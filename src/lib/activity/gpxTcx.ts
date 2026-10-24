import type { FitPoint } from "./fit";

/**
 * GPX and TCX recordings, read with plain pattern matching (no XML parser:
 * this runs in the same tests and workers as everything else). Only the
 * trackpoints are used: time, position, altitude and heart rate.
 */

export interface TrackFile {
  /** The file's own name for the activity, when it has one. */
  name?: string;
  /** TCX `Sport` attribute ("Running", "Biking"...). */
  sport?: string;
  points: FitPoint[];
}

const num = (s: string | undefined) => {
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
const tag = (block: string, name: string) => new RegExp(`<(?:\\w+:)?${name}[^>]*>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`, "i").exec(block)?.[1];
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function point(time: string | undefined, lat: number | undefined, lon: number | undefined, alt: number | undefined, hr: number | undefined): FitPoint | null {
  const t = time ? Date.parse(time) : NaN;
  if (Number.isNaN(t)) return null;
  const p: FitPoint = { t };
  if (lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) { p.lat = lat; p.lon = lon; }
  if (alt !== undefined) p.alt = alt;
  if (hr !== undefined) p.hr = hr;
  return p;
}

export function readGpx(text: string): TrackFile | null {
  const points: FitPoint[] = [];
  const re = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const lat = num(/\blat\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]);
    const lon = num(/\blon\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]);
    const p = point(tag(body, "time"), lat, lon, num(tag(body, "ele")), num(tag(body, "hr")));
    if (p) points.push(p);
  }
  if (points.length < 2) return null;
  const name = /<trk\b[^>]*>[\s\S]*?<name>([^<]*)<\/name>/i.exec(text)?.[1] ?? /<metadata>[\s\S]*?<name>([^<]*)<\/name>/i.exec(text)?.[1];
  return { ...(name?.trim() ? { name: unescape(name.trim()) } : {}), points };
}

export function readTcx(text: string): TrackFile | null {
  const points: FitPoint[] = [];
  const re = /<Trackpoint\b[^>]*>([\s\S]*?)<\/Trackpoint>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = m[1];
    const hrBlock = /<HeartRateBpm[^>]*>([\s\S]*?)<\/HeartRateBpm>/i.exec(body)?.[1];
    const p = point(tag(body, "Time"), num(tag(body, "LatitudeDegrees")), num(tag(body, "LongitudeDegrees")), num(tag(body, "AltitudeMeters")), hrBlock ? num(tag(hrBlock, "Value")) : undefined);
    if (p) points.push(p);
  }
  if (points.length < 2) return null;
  const sport = /<Activity\b[^>]*\bSport\s*=\s*["']([^"']+)["']/i.exec(text)?.[1];
  return { ...(sport ? { sport } : {}), points };
}

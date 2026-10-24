/**
 * A route as a small string. GPS tracks have thousands of points; an activity
 * keeps a simplified line (Douglas-Peucker, a few metres of tolerance) in
 * Google's encoded-polyline format (5 decimals, about 1 m), which is a
 * kilobyte or two - fine for the database and for Drive sync.
 */

export type LatLon = [lat: number, lon: number];

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Metres between two points. */
export function distanceBetween(a: LatLon, b: LatLon): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of a line in metres. */
export function trackLength(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceBetween(points[i - 1], points[i]);
  return total;
}

/** Perpendicular distance in metres of p from segment a-b (local flat approximation: fine at activity scale). */
function offSegment(p: LatLon, a: LatLon, b: LatLon): number {
  const k = Math.cos(rad(a[0]));
  const x = (q: LatLon) => [(q[1] - a[1]) * k * 111320, (q[0] - a[0]) * 110540] as const;
  const [px, py] = x(p);
  const [bx, by] = x(b);
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Douglas-Peucker with a hard cap on points: the tolerance grows until the line fits. */
export function simplifyTrack(points: LatLon[], toleranceM = 4, maxPoints = 300): LatLon[] {
  if (points.length <= 2) return points.slice();
  let tolerance = toleranceM;
  for (let attempt = 0; attempt < 12; attempt++) {
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length) {
      const [lo, hi] = stack.pop()!;
      let worst = 0;
      let at = -1;
      for (let i = lo + 1; i < hi; i++) {
        const d = offSegment(points[i], points[lo], points[hi]);
        if (d > worst) { worst = d; at = i; }
      }
      if (at !== -1 && worst > tolerance) {
        keep[at] = 1;
        stack.push([lo, at], [at, hi]);
      }
    }
    const out = points.filter((_, i) => keep[i]);
    if (out.length <= maxPoints) return out;
    tolerance *= 1.6;
  }
  // Last resort: even sampling.
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * step)]);
}

function encodeNumber(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

export function encodeTrack(points: LatLon[]): string {
  let lat = 0;
  let lon = 0;
  let out = "";
  for (const [la, lo] of points) {
    const ilat = Math.round(la * 1e5);
    const ilon = Math.round(lo * 1e5);
    out += encodeNumber(ilat - lat) + encodeNumber(ilon - lon);
    lat = ilat;
    lon = ilon;
  }
  return out;
}

export function decodeTrack(text: string): LatLon[] {
  const out: LatLon[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (i >= text.length) return null;
      b = text.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < text.length) {
    const dLat = next();
    const dLon = next();
    if (dLat === null || dLon === null) break;
    lat += dLat;
    lon += dLon;
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}

/** The encoded, simplified route of raw GPS points, or undefined when there is no usable line (under 2 points or under ~30 m long: a stationary or indoor recording). */
export function routeOf(points: { lat?: number; lon?: number }[]): string | undefined {
  const line: LatLon[] = [];
  for (const p of points) if (p.lat !== undefined && p.lon !== undefined) line.push([p.lat, p.lon]);
  if (line.length < 2 || trackLength(line) < 30) return undefined;
  return encodeTrack(simplifyTrack(line));
}

/**
 * Fits a route into a width x height box (flat projection, longitude shrunk
 * by cos(latitude)) with a margin, keeping its proportions.
 */
export function projectTrack(points: LatLon[], width: number, height: number, margin = 8): { x: number; y: number }[] {
  if (points.length === 0) return [];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [la, lo] of points) {
    minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la);
    minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo);
  }
  const k = Math.cos(rad((minLat + maxLat) / 2));
  const spanX = Math.max((maxLon - minLon) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((width - 2 * margin) / spanX, (height - 2 * margin) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return points.map(([la, lo]) => ({ x: offX + (lo - minLon) * k * scale, y: offY + (maxLat - la) * scale }));
}

/**
 * Reads an activity out of a Garmin FIT file (what Garmin devices, Garmin
 * Connect and Strava archives hold). Only what an activity log needs: the
 * session summary (sport, times, distance, ascent, heart rate, calories), the
 * GPS/heart-rate records and who made the file. Everything else in a FIT
 * file (laps, sets, devices, events, developer data) is read past.
 *
 * Handles chained files, big- and little-endian definitions, compressed
 * timestamp headers and developer fields. Never throws on a truncated or odd
 * file: it returns what it read, or null when there is no activity in it.
 */

export interface FitPoint {
  /** Epoch ms. */
  t: number;
  lat?: number;
  lon?: number;
  /** Metres. */
  alt?: number;
  hr?: number;
}

export interface FitActivity {
  sport?: number;
  subSport?: number;
  manufacturer?: number;
  /** Epoch ms of the first record or the session start. */
  startMs: number;
  elapsedSec: number;
  timerSec?: number;
  distanceM?: number;
  ascentM?: number;
  avgHr?: number;
  maxHr?: number;
  calories?: number;
  points: FitPoint[];
}

const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);
const SEMICIRCLE = 180 / 2 ** 31;

/** Base type number → [byte size, signed?, float?, invalid value]. */
const BASE: Record<number, { size: number; signed?: boolean; float?: boolean; invalid: number }> = {
  0: { size: 1, invalid: 0xff },
  1: { size: 1, signed: true, invalid: 0x7f },
  2: { size: 1, invalid: 0xff },
  3: { size: 2, signed: true, invalid: 0x7fff },
  4: { size: 2, invalid: 0xffff },
  5: { size: 4, signed: true, invalid: 0x7fffffff },
  6: { size: 4, invalid: 0xffffffff },
  7: { size: 1, invalid: NaN },
  8: { size: 4, float: true, invalid: NaN },
  9: { size: 8, float: true, invalid: NaN },
  10: { size: 1, invalid: 0 },
  11: { size: 2, invalid: 0 },
  12: { size: 4, invalid: 0 },
  13: { size: 1, invalid: 0xff },
  14: { size: 8, signed: true, invalid: NaN },
  15: { size: 8, invalid: NaN },
  16: { size: 8, invalid: 0 },
};

interface Definition {
  global: number;
  little: boolean;
  fields: { num: number; size: number; base: number }[];
  devBytes: number;
  length: number;
}

function readValue(view: DataView, at: number, size: number, baseType: number, little: boolean): number | undefined {
  const kind = baseType & 0x1f;
  const base = BASE[kind];
  // Strings and 64-bit ints are never needed here.
  if (!base || kind === 7 || kind >= 14 || size < base.size) return undefined;
  let v: number;
  switch (kind) {
    case 1: v = view.getInt8(at); break;
    case 3: v = view.getInt16(at, little); break;
    case 5: v = view.getInt32(at, little); break;
    case 4: case 11: v = view.getUint16(at, little); break;
    case 6: case 12: v = view.getUint32(at, little); break;
    case 8: v = view.getFloat32(at, little); break;
    case 9: v = view.getFloat64(at, little); break;
    case 0: case 2: case 10: case 13: v = view.getUint8(at); break;
    default: return undefined;
  }
  if (base.float) return Number.isFinite(v) ? v : undefined;
  // The "zero" base types (10-12, 16) treat 0 as invalid; the rest use all-ones / max.
  return v === base.invalid ? undefined : v;
}

type Msg = Record<number, number | undefined>;

/**
 * Calls `onMessage(globalNum, fields)` for every data message in every FIT
 * file in the buffer. Returning `false` from it stops reading (a caller that
 * only wants the file's kind stops after the first message).
 */
export function readFitMessages(buffer: ArrayBuffer | Uint8Array, onMessage: (global: number, fields: Msg) => void | boolean): void {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 12 <= bytes.length) {
    const headerSize = bytes[offset];
    if (headerSize < 12 || bytes[offset + 8] !== 0x2e || bytes[offset + 9] !== 0x46 || bytes[offset + 10] !== 0x49 || bytes[offset + 11] !== 0x54) return;
    const dataSize = view.getUint32(offset + 4, true);
    const end = Math.min(bytes.length, offset + headerSize + dataSize);
    let p = offset + headerSize;
    const defs = new Map<number, Definition>();
    let lastTs = 0;
    try {
      while (p < end) {
        const header = bytes[p++];
        let local: number;
        let compressed = false;
        if (header & 0x80) {
          compressed = true;
          local = (header >> 5) & 0x03;
          const delta = header & 0x1f;
          lastTs = (lastTs & ~0x1f) + delta + (delta < (lastTs & 0x1f) ? 0x20 : 0);
        } else if (header & 0x40) {
          local = header & 0x0f;
          const hasDev = (header & 0x20) !== 0;
          p++; // reserved
          const little = bytes[p++] === 0;
          const global = view.getUint16(p, little);
          p += 2;
          const count = bytes[p++];
          const fields: Definition["fields"] = [];
          let length = 0;
          for (let i = 0; i < count; i++) {
            fields.push({ num: bytes[p], size: bytes[p + 1], base: bytes[p + 2] });
            length += bytes[p + 1];
            p += 3;
          }
          let devBytes = 0;
          if (hasDev) {
            const devCount = bytes[p++];
            for (let i = 0; i < devCount; i++) {
              devBytes += bytes[p + 1];
              p += 3;
            }
          }
          defs.set(local, { global, little, fields, devBytes, length });
          continue;
        } else {
          local = header & 0x0f;
        }
        const def = defs.get(local);
        if (!def) return;
        const msg: Msg = {};
        let q = p;
        for (const f of def.fields) {
          // A field larger than its type is an array; the first element is enough.
          msg[f.num] = readValue(view, q, f.size, f.base, def.little);
          q += f.size;
        }
        p += def.length + def.devBytes;
        if (msg[253] !== undefined) lastTs = msg[253]!;
        else if (compressed) msg[253] = lastTs;
        if (onMessage(def.global, msg) === false) return;
      }
    } catch {
      // Truncated: keep what was read.
    }
    offset = end + 2; // + CRC
  }
}

const sc = (v: number | undefined) => (v === undefined ? undefined : v * SEMICIRCLE);

export function readFitActivity(buffer: ArrayBuffer | Uint8Array): FitActivity | null {
  const points: FitPoint[] = [];
  let manufacturer: number | undefined;
  const sessions: Msg[] = [];
  readFitMessages(buffer, (global, m) => {
    if (global === 0 && manufacturer === undefined) manufacturer = m[1];
    else if (global === 18) sessions.push(m);
    else if (global === 20 && m[253] !== undefined) {
      const alt = m[78] !== undefined ? m[78]! / 5 - 500 : m[2] !== undefined ? m[2]! / 5 - 500 : undefined;
      const lat = sc(m[0]);
      const lon = sc(m[1]);
      points.push({
        t: FIT_EPOCH_MS + m[253]! * 1000,
        ...(lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : {}),
        ...(alt !== undefined ? { alt } : {}),
        ...(m[3] !== undefined ? { hr: m[3] } : {}),
      });
    }
  });

  const first = sessions[0];
  if (!first && points.length < 2) return null;
  const sum = (key: number) => {
    const vals = sessions.map((s) => s[key]).filter((v): v is number => v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : undefined;
  };
  const startMs = first?.[2] !== undefined ? FIT_EPOCH_MS + first[2]! * 1000 : points[0]?.t;
  if (startMs === undefined) return null;
  const lastT = points.length ? points[points.length - 1].t : startMs;
  const elapsed = sum(7);
  const timer = sum(8);
  const dist = sum(9);
  const hrs = points.map((p) => p.hr).filter((h): h is number => h !== undefined);
  const out: FitActivity = {
    startMs,
    elapsedSec: elapsed !== undefined ? elapsed / 1000 : Math.max(0, (lastT - startMs) / 1000),
    points,
  };
  if (first?.[5] !== undefined) out.sport = first[5];
  if (first?.[6] !== undefined) out.subSport = first[6];
  if (manufacturer !== undefined) out.manufacturer = manufacturer;
  if (timer !== undefined) out.timerSec = timer / 1000;
  if (dist !== undefined) out.distanceM = dist / 100;
  const ascent = sum(22);
  if (ascent !== undefined) out.ascentM = ascent;
  const avg = first?.[16] ?? (hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined);
  if (avg !== undefined) out.avgHr = avg;
  const max = first?.[17] ?? (hrs.length ? Math.max(...hrs) : undefined);
  if (max !== undefined) out.maxHr = max;
  const cal = sum(11);
  if (cal !== undefined) out.calories = cal;
  return out;
}

/** A readable sport for the FIT sport/sub-sport numbers (only the common ones; anything else is "Activity"). */
export function fitSportName(sport: number | undefined, subSport?: number): string {
  if (sport === 10 && subSport === 20) return "Weight Training";
  switch (sport) {
    case 1: return "Run";
    case 2: return "Ride";
    case 4: return "Workout";
    case 5: return "Swim";
    case 10: return "Workout";
    case 11: return "Walk";
    case 12: return "Nordic Ski";
    case 13: return "Alpine Ski";
    case 15: return "Row";
    case 17: return "Hike";
    case 31: return "Rock Climbing";
    default: return "Activity";
  }
}

/** What a FIT file is (the `type` of its first message: 4 activity, 32 monitoring, 49 sleep, 68 HRV status ...), or undefined. Reads only the start of the file. */
export function fitFileType(buffer: ArrayBuffer | Uint8Array): number | undefined {
  let type: number | undefined;
  readFitMessages(buffer, (global, m) => {
    if (global === 0) type = m[0];
    return false;
  });
  return type;
}

export interface FitHrvNight {
  /** Epoch ms of the status message (the morning the night ended). */
  t: number;
  /** Last night's average HRV, ms. */
  lastNight: number;
  /** The 7-day average, ms. */
  weekly?: number;
}

/**
 * The overnight HRV of an HRV-status file (Garmin FIT type 68): its
 * `hrv_status_summary` message (370), whose values are scaled by 128. Checked
 * against Garmin's own JSON export: the same numbers to within 0.5 ms.
 */
export function readFitHrv(buffer: ArrayBuffer | Uint8Array): FitHrvNight[] {
  const out: FitHrvNight[] = [];
  readFitMessages(buffer, (global, m) => {
    if (global === 370 && m[253] !== undefined && m[1] !== undefined) {
      out.push({ t: FIT_EPOCH_MS + m[253]! * 1000, lastNight: m[1]! / 128, ...(m[0] !== undefined ? { weekly: m[0]! / 128 } : {}) });
    }
  });
  return out;
}

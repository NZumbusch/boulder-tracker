/**
 * The numbers behind the app's judgements that are a matter of taste or
 * physiology rather than fact - readiness thresholds, ACWR zones, how fast
 * fatigue fades, when rock counts as wet, how long lists are. Each is a
 * registry entry (id, label, range, default); `Preferences.tunables` holds
 * the user's values, repaired against this list on load, and Settings
 * renders each topic's entries generically. The analysis code keeps its
 * own named defaults and takes these as optional config, so behaviour is
 * unchanged until a value is edited.
 *
 * Values are always stored in the app's canonical units (°C, mm, days) -
 * display units are a separate preference.
 */

export type TunableTopic = "model" | "outdoor" | "layout";

interface BaseDef {
  id: string;
  topic: TunableTopic;
  /** Heading the entry is grouped under within its topic. */
  group: string;
  label: string;
  hint?: string;
}

export interface NumberTunable extends BaseDef {
  kind: "number";
  default: number;
  min: number;
  max: number;
  step: number;
  /** Shown after the value. "°C" entries are converted when °F is chosen. */
  unit?: string;
  /** Stored as a fraction, shown and edited as a percentage (0.1 -> 10 %). */
  percent?: boolean;
  /** A value of 0 means "off" and is labelled so. */
  zeroMeansOff?: boolean;
}

export interface BooleanTunable extends BaseDef {
  kind: "boolean";
  default: boolean;
}

export type TunableDef = NumberTunable | BooleanTunable;

export const TUNABLES: TunableDef[] = [
  // --- Training model ---
  { id: "readiness.useFatigue", topic: "model", group: "Readiness score", label: "Count fatigue", kind: "boolean", default: true },
  { id: "readiness.useAcwr", topic: "model", group: "Readiness score", label: "Count load (ACWR)", kind: "boolean", default: true },
  { id: "readiness.useSleep", topic: "model", group: "Readiness score", label: "Count sleep", kind: "boolean", default: true },
  { id: "readiness.useHrv", topic: "model", group: "Readiness score", label: "Count HRV", kind: "boolean", default: true },
  { id: "readiness.sleepLow", topic: "model", group: "Readiness score", label: "Low sleep score", hint: "Below this, sleep starts costing points", kind: "number", default: 60, min: 20, max: 95, step: 5, unit: "pts" },
  { id: "readiness.hrvDip", topic: "model", group: "Readiness score", label: "HRV dip that counts", hint: "How far below your 14-day baseline before HRV costs points", kind: "number", default: 0.1, min: 0.02, max: 0.4, step: 0.01, percent: true },
  { id: "acwr.sweetMin", topic: "model", group: "ACWR zones", label: "Sweet spot from", hint: "Below this counts as low load", kind: "number", default: 0.8, min: 0.5, max: 1.2, step: 0.05 },
  { id: "acwr.caution", topic: "model", group: "ACWR zones", label: "Caution from", kind: "number", default: 1.3, min: 1.0, max: 1.8, step: 0.05 },
  { id: "acwr.highRisk", topic: "model", group: "ACWR zones", label: "High risk from", hint: "Also where the readiness load penalty is at its maximum", kind: "number", default: 1.5, min: 1.1, max: 2.5, step: 0.05 },
  { id: "fatigue.halfLifeDays", topic: "model", group: "Fatigue", label: "Fatigue half-life", hint: "Days for logged fatigue to fade by half on the Fatigue card and in readiness", kind: "number", default: 3, min: 1, max: 10, step: 0.5, unit: "days" },
  { id: "alerts.restDays", topic: "model", group: "Alerts", label: "Days without rest before warning", kind: "number", default: 6, min: 3, max: 14, step: 1, unit: "days" },

  // --- Outdoor ---
  { id: "friction.idealMinC", topic: "outdoor", group: "Conditions", label: "Ideal temperature from", kind: "number", default: 0, min: -15, max: 20, step: 1, unit: "°C" },
  { id: "friction.idealMaxC", topic: "outdoor", group: "Conditions", label: "Ideal temperature to", hint: "Warmer than this starts costing friction points", kind: "number", default: 12, min: 0, max: 30, step: 1, unit: "°C" },
  { id: "friction.wetRainMm", topic: "outdoor", group: "Conditions", label: "Rain that makes rock wet", hint: "In the last 24 h - lower for sandstone, higher for quick-drying rock", kind: "number", default: 5, min: 0.5, max: 30, step: 0.5, unit: "mm" },
  { id: "trips.conflictHorizonDays", topic: "outdoor", group: "Trips", label: "Warn about sessions during a trip", hint: "How far ahead of a trip", kind: "number", default: 21, min: 3, max: 90, step: 1, unit: "days" },
  { id: "trips.lastTripDays", topic: "outdoor", group: "Trips", label: "Show last trip in Progress for", kind: "number", default: 90, min: 7, max: 365, step: 1, unit: "days" },


  // --- Layout ---
  { id: "home.recentActivityCount", topic: "layout", group: "Home lists", label: "Recent Activity items", kind: "number", default: 3, min: 1, max: 10, step: 1 },
  { id: "home.progressBenchmarks", topic: "layout", group: "Home lists", label: "Benchmarks in Progress", kind: "number", default: 3, min: 1, max: 10, step: 1 },
  { id: "progress.retestWeeks", topic: "layout", group: "Progress", label: "Retest nudge after", kind: "number", default: 6, min: 2, max: 26, step: 1, unit: "weeks" },
  { id: "alerts.backupDays", topic: "layout", group: "Alerts", label: "Remind to back up after", hint: "0 turns the reminder off", kind: "number", default: 14, min: 0, max: 90, step: 1, unit: "days", zeroMeansOff: true },
];

export type Tunables = Record<string, number | boolean>;

export function defaultTunables(): Tunables {
  return Object.fromEntries(TUNABLES.map((t) => [t.id, t.default]));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Keeps ordered pairs in order - nudging the later value just past the earlier one. */
function keepOrdered(values: Tunables, lowId: string, highId: string, gap: number) {
  const low = values[lowId] as number;
  const high = values[highId] as number;
  if (high <= low) values[highId] = Math.round((low + gap) * 100) / 100;
}

/**
 * Repairs an unknown value into a full `Tunables` map: known ids keep a
 * value of the right type (numbers clamped to their range), unknown ids
 * are dropped, missing ones get defaults, and ranges that must stay
 * ordered (ACWR zones, the ideal temperature band) are kept so. Never throws.
 */
export function validateTunables(raw: unknown): Tunables {
  const result = defaultTunables();
  const candidate = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  for (const def of TUNABLES) {
    const value = candidate[def.id];
    if (def.kind === "boolean" && typeof value === "boolean") result[def.id] = value;
    if (def.kind === "number" && typeof value === "number" && Number.isFinite(value)) result[def.id] = clamp(value, def.min, def.max);
  }
  keepOrdered(result, "acwr.sweetMin", "acwr.caution", 0.05);
  keepOrdered(result, "acwr.caution", "acwr.highRisk", 0.05);
  keepOrdered(result, "friction.idealMinC", "friction.idealMaxC", 1);
  return result;
}

/** `values` with every entry of `topic` back at its default. */
export function resetTopic(values: Tunables, topic: TunableTopic): Tunables {
  const next = { ...values };
  for (const def of TUNABLES) if (def.topic === topic) next[def.id] = def.default;
  return next;
}

export function num(values: Tunables, id: string): number {
  const v = values[id];
  if (typeof v === "number") return v;
  const def = TUNABLES.find((t) => t.id === id);
  return def && def.kind === "number" ? def.default : 0;
}

export function flag(values: Tunables, id: string): boolean {
  const v = values[id];
  if (typeof v === "boolean") return v;
  const def = TUNABLES.find((t) => t.id === id);
  return def && def.kind === "boolean" ? def.default : true;
}

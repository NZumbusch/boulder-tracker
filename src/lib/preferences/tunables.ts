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
  { id: "readiness.usePain", topic: "model", group: "Readiness score", label: "Count open pain", hint: "The worst open pain issue costs up to 15 points, by its latest check-in", kind: "boolean", default: true },
  { id: "readiness.sleepLow", topic: "model", group: "Readiness score", label: "Low sleep score", hint: "Below this, sleep starts costing points", kind: "number", default: 60, min: 20, max: 95, step: 5, unit: "pts" },
  { id: "readiness.sleepShortHours", topic: "model", group: "Readiness score", label: "Short sleep", hint: "Used when there's no sleep score for the day (e.g. sleep from Health Connect): less than this starts costing points", kind: "number", default: 7, min: 4, max: 10, step: 0.5, unit: "h" },
  { id: "readiness.hrvDip", topic: "model", group: "Readiness score", label: "HRV dip that counts", hint: "How far below your 14-day baseline before HRV costs points", kind: "number", default: 0.1, min: 0.02, max: 0.4, step: 0.01, percent: true },
  { id: "acwr.sweetMin", topic: "model", group: "ACWR zones", label: "Sweet spot from", hint: "Below this counts as low load", kind: "number", default: 0.8, min: 0.5, max: 1.2, step: 0.05 },
  { id: "acwr.caution", topic: "model", group: "ACWR zones", label: "Caution from", kind: "number", default: 1.3, min: 1.0, max: 1.8, step: 0.05 },
  { id: "acwr.highRisk", topic: "model", group: "ACWR zones", label: "High risk from", hint: "Also where the readiness load penalty is at its maximum", kind: "number", default: 1.5, min: 1.1, max: 2.5, step: 0.05 },
  { id: "fatigue.halfLifeDays", topic: "model", group: "Fatigue", label: "Fatigue half-life", hint: "Each session's rating is what it added; it fades by half over this many days, and what's left of every session adds up (Fatigue card, readiness, Analytics, AI coach)", kind: "number", default: 3, min: 1, max: 10, step: 0.5, unit: "days" },
  { id: "fatigue.sumStacking", topic: "model", group: "Fatigue", label: "Add sessions up plainly", hint: "Off: each session uses up its share of the capacity that's still free, so two medium sessions read about 7.5, not 10. On: the faded ratings are simply added (and capped at 10)", kind: "boolean", default: false },
  { id: "fatigue.soften", topic: "model", group: "Fatigue", label: "Soften stacked sessions", hint: "Only when sessions are added up plainly. Off: the sum is capped at 10. On: readings above the point below bend smoothly towards 10 instead of hitting it", kind: "boolean", default: false },
  { id: "fatigue.softKnee", topic: "model", group: "Fatigue", label: "Softening starts at", hint: "Readings up to this are left as they are; lower softens more", kind: "number", default: 6, min: 2, max: 9, step: 0.5, unit: "/10" },
  { id: "checkin.day", topic: "model", group: "Insights", label: "Weekly check-in from", hint: "Home offers the weekly check-in from this weekday until it is done", kind: "number", default: 7, min: 0, max: 7, step: 1 },
  { id: "insights.staleDays", topic: "model", group: "Insights", label: "Call a category stale after", hint: "Insights notes a kind of training you do regularly (in 3+ sessions over 12 weeks) once it has been left this long", kind: "number", default: 14, min: 5, max: 60, step: 1, unit: "days" },
  { id: "insights.adherenceLow", topic: "model", group: "Insights", label: "Plan adherence called low under", hint: "Share of planned sessions done over the last 4 weeks", kind: "number", default: 0.6, min: 0.2, max: 0.95, step: 0.05, percent: true },
  { id: "alerts.insightNotify", topic: "layout", group: "Heads-ups", label: "Notify me when something needs attention", hint: "One notification in the morning when Insights finds a load spike, a long run of training days or an HRV dip. Android only; it is worked out whenever the app opens", kind: "boolean", default: false },
  { id: "alerts.insightHour", topic: "layout", group: "Heads-ups", label: "Heads-up at", kind: "number", default: 8, min: 5, max: 12, step: 1, unit: "h" },
  { id: "alerts.fatigueReminder", topic: "layout", group: "Alerts", label: "Fatigue log reminder", hint: "A notification once a planned session's time has passed, asking whether it happened. Android only, and only while notifications are allowed", kind: "boolean", default: true },
  { id: "alerts.restDays", topic: "model", group: "Alerts", label: "Days without rest before warning", kind: "number", default: 6, min: 3, max: 14, step: 1, unit: "days" },

  // --- Outdoor ---
  { id: "friction.idealMinC", topic: "outdoor", group: "Conditions", label: "Ideal temperature from", kind: "number", default: 0, min: -15, max: 20, step: 1, unit: "°C" },
  { id: "friction.idealMaxC", topic: "outdoor", group: "Conditions", label: "Ideal temperature to", hint: "Warmer than this starts costing friction points", kind: "number", default: 12, min: 0, max: 30, step: 1, unit: "°C" },
  { id: "friction.wetRainMm", topic: "outdoor", group: "Conditions", label: "Rain that makes rock wet", hint: "In the last 24 h - lower for sandstone, higher for quick-drying rock", kind: "number", default: 5, min: 0.5, max: 30, step: 0.5, unit: "mm" },
  { id: "trips.conflictHorizonDays", topic: "outdoor", group: "Trips", label: "Warn about sessions during a trip", hint: "How far ahead of a trip", kind: "number", default: 21, min: 3, max: 90, step: 1, unit: "days" },
  { id: "trips.lastTripDays", topic: "outdoor", group: "Trips", label: "Show last trip in Progress for", kind: "number", default: 90, min: 7, max: 365, step: 1, unit: "days" },


  // --- Layout ---
  { id: "ui.flatCards", topic: "layout", group: "Look", label: "Flat sections instead of panels", hint: "Off: grouped content sits on a soft, borderless panel. On: no panel at all - sections are separated by whitespace and a hairline, like the calendar", kind: "boolean", default: false },
  { id: "plan.weekAgenda", topic: "layout", group: "Plan calendar", label: "Show the week as a list", hint: "On: the calendar's Week view is seven day rows with full session names and exercises. Off: seven narrow columns on an hour grid", kind: "boolean", default: false },
  { id: "plan.exerciseList", topic: "layout", group: "Plan calendar", label: "Exercises as a list", hint: "In the week list, each session's exercises are plain lines with a colour dot instead of coloured chips", kind: "boolean", default: false },
  { id: "plan.highContrast", topic: "layout", group: "Plan calendar", label: "Higher contrast", hint: "Solid colours and a firmer edge on sessions and phone-calendar events, so pale blocks stand out from the grey ground - for poor light or weaker eyesight", kind: "boolean", default: false },
  { id: "plan.eventEdges", topic: "layout", group: "Plan calendar", label: "Edges on phone-calendar events", hint: "A fine edge in each event's colour, so pale events stand out from the grey ground. Higher contrast above always draws a firmer one", kind: "boolean", default: false },
  { id: "plan.weekListOnPhone", topic: "layout", group: "Plan calendar", label: "List on a phone held upright", hint: "Seven columns are too narrow for names on a phone in portrait, so it shows the list there even with the setting above off. Tablets, laptops and a phone on its side keep the grid", kind: "boolean", default: true },
  { id: "plan.calendarPhases", topic: "layout", group: "Plan calendar", label: "Show phases in the calendar", hint: "A thin colour strip for the phase on each day: under the days in Day and Week, down the week list's rows, under each date in Month. Phases are edited in the Block manager", kind: "boolean", default: true },
  { id: "plan.calendarPhaseNames", topic: "layout", group: "Plan calendar", label: "Write the phase name on it", hint: "Only with the strip on: the phase's name where it starts", kind: "boolean", default: false },
  { id: "plan.calendarPhaseTint", topic: "layout", group: "Plan calendar", label: "Tint each day with its phase", hint: "Only with the strip on: a very light wash of the phase's colour behind each day in Day and Week, so the phase reads at a glance", kind: "boolean", default: true },
  { id: "plan.calendarCategoryColors", topic: "layout", group: "Plan calendar", label: "Colour sessions by exercise category", hint: "Off: every session is the same green, and the colours belong to phases and to the phone calendar's events. On: each session takes the colour of the category that takes most of it", kind: "boolean", default: false },
  { id: "day.startHour", topic: "layout", group: "Day", label: "New day starts at", hint: "Hour of the night (0 = midnight). Until then, after midnight still counts as the day before: no new-day reminders, metric or pain prompts, and Today stays on the day you are finishing. Sessions and logs keep their real time", kind: "number", default: 4, min: 0, max: 8, step: 1, unit: "h" },
  { id: "timer.leadIn", topic: "layout", group: "Single-exercise timer", label: "Get-ready time", hint: "Counted in before a hang, set or pacer starts - an exercise can set its own", kind: "number", default: 10, min: 0, max: 60, step: 1, unit: "s" },
  { id: "timer.setRest", topic: "layout", group: "Single-exercise timer", label: "Rest between sets", hint: "Used when an exercise with several sets doesn't say; a rest it names (even 0) wins", kind: "number", default: 120, min: 0, max: 600, step: 15, unit: "s" },
  { id: "timer.openNext", topic: "layout", group: "Single-exercise timer", label: "Open the next exercise's timer", hint: "After you log an exercise in a live session, the timer of the next one that has timing opens, ready for Start (it never starts by itself)", kind: "boolean", default: true },
  { id: "circuit.askSkip", topic: "layout", group: "Circuits", label: "Ask what to skip", hint: "Skipping one exercise of a circuit asks whether to skip just it or the whole circuit. Off: only that exercise is skipped and the circuit runs without it", kind: "boolean", default: true },
  { id: "home.recentActivityCount", topic: "layout", group: "Home lists", label: "Recent activity items", kind: "number", default: 3, min: 1, max: 10, step: 1 },
  { id: "home.progressBenchmarks", topic: "layout", group: "Home lists", label: "Tests in Progress", kind: "number", default: 3, min: 1, max: 10, step: 1 },
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

import type { ExternalActivity, Workout } from "../types";
import { addDaysIso, localIsoDate, weekMondayIso } from "../dateUtils";
import { WEEK_DAYS } from "../constants";
import { isSkippedWorkout } from "../planning/weekStatus";

/**
 * "Is this the same thing I already have?" for an imported activity.
 *
 * Three kinds of match, strongest first:
 *  - `activity`: another imported activity (Strava and Garmin both hold the
 *    same run) - the times overlap by at least half of the shorter one;
 *  - `logged`: a session you logged (`status: completed`) at the same time;
 *  - `planned`: a session planned for that time - the activity is probably
 *    what you did, so it is kept and the session named.
 * A session without a time of day can only match by day, and only when its
 * text names the same kind of activity ("Easy run" and a Run). That match is
 * marked `day`; the others are `time`.
 */

export interface Overlap {
  kind: "activity" | "logged" | "planned";
  how: "time" | "day";
  id: string;
  /** What to call it: the other activity's name, or the session's. */
  label: string;
}

/** A shared minute count above this share of the shorter of the two is "at the same time". */
const MIN_SHARE = 0.5;
/** A session with a start time but no length is taken to run this long. */
const DEFAULT_MINUTES = 60;
const MIN_SPAN_MS = 5 * 60_000;

const KEYWORDS: [group: string, words: RegExp][] = [
  ["run", /\b(run|runs|running|jog|jogging)\b/i],
  ["ride", /\b(ride|rides|riding|bike|biking|cycling|cycle)\b/i],
  ["walk", /\b(walk|walks|walking)\b/i],
  ["hike", /\b(hike|hiking|trek)\b/i],
  ["swim", /\b(swim|swimming)\b/i],
  ["ski", /\b(ski|skiing)\b/i],
];

/** The kind of activity a text names ("Easy run" → run), or undefined. */
export function kindInText(text: string): string | undefined {
  return KEYWORDS.find(([, re]) => re.test(text))?.[0];
}

/** An imported activity's kind from its type ("Trail Run", "Virtual Ride"). */
export function kindOfType(type: string): string | undefined {
  return kindInText(type.replace(/([a-z])([A-Z])/g, "$1 $2"));
}

interface Span { start: number; end: number }

function activitySpan(a: ExternalActivity): Span | null {
  const start = Date.parse(a.start);
  if (Number.isNaN(start)) return null;
  return { start, end: start + Math.max(a.durationSec * 1000, MIN_SPAN_MS) };
}

/** The local day a session sits on: a done one on its date, a planned one on its week and day (its `date` is only when it was created). */
export function sessionIsoDay(w: Workout): string | null {
  if (w.status === "completed" && w.date) return w.date.slice(0, 10);
  if (!w.dayOfWeek || !w.weekId) return null;
  return addDaysIso(weekMondayIso(w.weekId), WEEK_DAYS.indexOf(w.dayOfWeek));
}

function workoutSpan(w: Workout): Span | null {
  const day = sessionIsoDay(w);
  if (!day || !w.startTime) return null;
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi] = w.startTime.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return null;
  const start = new Date(y, mo - 1, d, h, mi).getTime();
  const minutes = w.status === "completed" ? w.actualDuration ?? w.plannedDuration : w.plannedDuration ?? w.actualDuration;
  return { start, end: start + Math.max((minutes ?? DEFAULT_MINUTES) * 60_000, MIN_SPAN_MS) };
}

/** Share of the shorter span that the two have in common (0 to 1). */
export function sharedShare(a: Span, b: Span): number {
  const shared = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (shared <= 0) return 0;
  return shared / Math.min(a.end - a.start, b.end - b.start);
}

export interface OverlapContext {
  /** Sessions on or around the activity's day (completed and planned, as the week shows them). */
  workouts: Workout[];
  /** The other imported activities. */
  activities: ExternalActivity[];
  /** What a session is called and what it contains, for the "Easy run" day match. */
  label: (w: Workout) => string;
  /** Text to search for the kind of activity (name, notes, exercises). Defaults to `label`. */
  text?: (w: Workout) => string;
}

export function findOverlaps(a: ExternalActivity, ctx: OverlapContext): Overlap[] {
  const span = activitySpan(a);
  const out: Overlap[] = [];

  if (span) {
    for (const other of ctx.activities) {
      if (other.id === a.id) continue;
      const os = activitySpan(other);
      if (os && sharedShare(span, os) >= MIN_SHARE) out.push({ kind: "activity", how: "time", id: other.id, label: other.name });
    }
  }

  const kind = kindOfType(a.type);
  for (const w of ctx.workouts) {
    const day = sessionIsoDay(w);
    if (!day || isSkippedWorkout(w)) continue;
    const type: Overlap["kind"] = w.status === "completed" ? "logged" : "planned";
    const ws = workoutSpan(w);
    if (ws && span) {
      if (sharedShare(span, ws) >= MIN_SHARE) out.push({ kind: type, how: "time", id: w.id, label: ctx.label(w) });
    } else if (!ws && kind && day === a.date && kindInText((ctx.text ?? ctx.label)(w)) === kind) {
      out.push({ kind: type, how: "day", id: w.id, label: ctx.label(w) });
    }
  }

  const rank = { activity: 0, logged: 1, planned: 2 } as const;
  return out.sort((x, y) => rank[x.kind] - rank[y.kind] || (x.how === y.how ? 0 : x.how === "time" ? -1 : 1));
}

/** The local day of an activity's start, and the day before (a late session can run past midnight). */
export function daysAround(a: ExternalActivity): string[] {
  const start = new Date(a.start);
  return [localIsoDate(new Date(start.getTime() - 86_400_000)), a.date, localIsoDate(new Date(start.getTime() + 86_400_000))];
}

// --- Importing ---------------------------------------------------------------

export interface ImportPlan {
  /** To add given the options. */
  add: ExternalActivity[];
  /** Same id already stored. */
  already: ExternalActivity[];
  /** Already stored without stats (imported before they existed) and this import has them: the stored copy can be filled in. */
  refresh: ExternalActivity[];
  /** The same activity as one already stored from another source. */
  duplicates: { activity: ExternalActivity; with: Overlap }[];
  /** Overlaps a session you logged, by time or (marked) by day. Only a match by time is skipped. */
  logged: { activity: ExternalActivity; with: Overlap }[];
  /** Overlaps a planned session: kept, and named in the preview. */
  planned: { activity: ExternalActivity; with: Overlap }[];
}

export interface ImportOptions {
  skipDuplicates: boolean;
  skipLogged: boolean;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { skipDuplicates: true, skipLogged: true };

/**
 * What an import would do. `workoutsAround(day)` supplies the sessions of a
 * day and its neighbours; an activity already stored by id is never added
 * again, whatever the options.
 */
export function planImport(
  existing: ExternalActivity[],
  incoming: ExternalActivity[],
  workoutsAround: (days: string[]) => Workout[],
  label: (w: Workout) => string,
  options: ImportOptions = DEFAULT_IMPORT_OPTIONS,
  text?: (w: Workout) => string,
): ImportPlan {
  const have = new Map(existing.map((a) => [a.id, a]));
  const plan: ImportPlan = { add: [], already: [], refresh: [], duplicates: [], logged: [], planned: [] };
  for (const a of incoming) {
    if (have.has(a.id)) {
      plan.already.push(a);
      if (a.stats && !have.get(a.id)!.stats) plan.refresh.push(a);
      continue;
    }
    const found = findOverlaps(a, {
      // Only other sources count as duplicates (the same source is told apart by id) - ones already stored and ones this import is adding.
      activities: [...existing, ...plan.add].filter((e) => e.source !== a.source),
      workouts: workoutsAround(daysAround(a)),
      label,
      text,
    });
    const dup = found.find((o) => o.kind === "activity");
    const logged = found.find((o) => o.kind === "logged");
    const planned = found.find((o) => o.kind === "planned");
    if (dup) plan.duplicates.push({ activity: a, with: dup });
    else if (logged) plan.logged.push({ activity: a, with: logged });
    else if (planned) plan.planned.push({ activity: a, with: planned });
    // Only a match by time is skipped; one by day and keyword ("Easy run") is a hint, shown but kept.
    if ((dup && options.skipDuplicates) || (!dup && logged?.how === "time" && options.skipLogged)) continue;
    plan.add.push(a);
  }
  return plan;
}

import type { DayOfWeek, PlanAlternative, PlanBChange, PlanBOccurrence, PlanBTag, PlanSide, Workout, WorkoutTemplate } from "../types";
import { WEEK_DAYS } from "../constants";
import { getWeekDates, getWeekId, incrementWeekId } from "../dateUtils";
import { generateWorkoutsFromTemplate } from "./generateWorkoutsFromTemplate";

/**
 * Plan B: an uncertain stretch of days with two versions of the plan.
 *
 * Plan A is whatever the weeks show anyway - projected from their phase or
 * stored. A `PlanAlternative` holds only the differences Plan B makes on
 * top (swap this session, drop that one, add another), and they are
 * applied here whenever a week is read. Nothing about a Plan B is written
 * into weeks, so it never materialises one, crosses week and phase
 * boundaries freely, and keeps working when the plan under it changes -
 * a change whose Plan A session has gone is reported as stale instead.
 *
 * Which side counts: the chosen one, else the likely one (default A). A
 * side is chosen by hand, or by logging a session only that side has.
 * Sessions of the side that doesn't count are still shown (faded, and as
 * "not chosen" once decided) but are left out of everything that adds up
 * the plan - see `applyPlanBsToWeek`'s `active`.
 *
 * Plan B's own sessions get deterministic ids (`planBSessionId`), so the
 * same virtual session keeps its identity across renders, and logging one
 * stores it under that id - which is how a logged Plan B session is
 * recognised as "Plan B was done" afterwards.
 *
 * Everything here is pure.
 */

const DAY_MS = 86_400_000;
export const MAX_PLAN_B_DAYS = 14;
export const PLAN_B_ID_PREFIX = "planb";

// --- Ids ---------------------------------------------------------------------

export function planBSessionId(altId: string, occurrence: string, changeId: string): string {
  return `${PLAN_B_ID_PREFIX}:${altId}:${occurrence}:${changeId}`;
}

export function parsePlanBSessionId(id: string): { altId: string; occurrence: string; changeId: string } | undefined {
  const parts = id.split(":");
  if (parts.length !== 4 || parts[0] !== PLAN_B_ID_PREFIX) return undefined;
  return { altId: parts[1], occurrence: parts[2], changeId: parts[3] };
}

export function isPlanBSessionId(id: string): boolean {
  return id.startsWith(`${PLAN_B_ID_PREFIX}:`);
}

// --- Days --------------------------------------------------------------------

/** A calendar day as a whole number (days since 1970-01-01), from a week and weekday. */
export function dayIndexOf(weekId: string, day: DayOfWeek): number {
  const dates = getWeekDates(weekId);
  if (!dates) return NaN;
  return Math.floor(dates.start.getTime() / DAY_MS) + WEEK_DAYS.indexOf(day);
}

/** The week and weekday of a day index. */
export function weekAndDayOf(dayIndex: number): { weekId: string; day: DayOfWeek } {
  const d = new Date(dayIndex * DAY_MS);
  // getWeekId reads local date parts; hand it local noon of the same calendar day.
  const weekId = getWeekId(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
  // Day 0 (1970-01-01) was a Thursday.
  return { weekId, day: WEEK_DAYS[(((dayIndex + 3) % 7) + 7) % 7] };
}

export function isoOfDay(dayIndex: number): string {
  return new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
}

// --- Occurrences -------------------------------------------------------------

/** Every occurrence's key (the week it starts in), skipped ones included. */
export function allOccurrenceKeys(alt: PlanAlternative): string[] {
  const keys = [alt.startWeekId];
  if (!alt.repeatUntilWeekId) return keys;
  let week = alt.startWeekId;
  for (let guard = 0; guard < 520 && week < alt.repeatUntilWeekId; guard++) {
    week = incrementWeekId(week);
    keys.push(week);
  }
  return keys;
}

/** The occurrences that apply (skipped ones left out). */
export function occurrenceKeys(alt: PlanAlternative): string[] {
  return allOccurrenceKeys(alt).filter((k) => !alt.occurrences?.[k]?.skipped);
}

export function occurrenceFirstDay(alt: PlanAlternative, key: string): number {
  return dayIndexOf(key, alt.startDay);
}

export function occurrenceState(alt: PlanAlternative, key: string): PlanBOccurrence {
  return alt.occurrences?.[key] ?? {};
}

/** Occurrences whose days overlap `weekId`. */
export function occurrencesTouchingWeek(alternatives: PlanAlternative[], weekId: string): { alt: PlanAlternative; key: string }[] {
  const weekStart = dayIndexOf(weekId, "Monday");
  if (Number.isNaN(weekStart)) return [];
  const hits: { alt: PlanAlternative; key: string }[] = [];
  for (const alt of alternatives) {
    for (const key of occurrenceKeys(alt)) {
      const first = occurrenceFirstDay(alt, key);
      const last = first + alt.days - 1;
      if (first <= weekStart + 6 && last >= weekStart) hits.push({ alt, key });
      if (first > weekStart + 6) break;
    }
  }
  return hits;
}

/** The occurrence covering a day, if any. */
export function occurrenceOnDay(alternatives: PlanAlternative[], dayIndex: number): { alt: PlanAlternative; key: string } | undefined {
  const { weekId } = weekAndDayOf(dayIndex);
  return occurrencesTouchingWeek(alternatives, weekId).find(({ alt, key }) => {
    const first = occurrenceFirstDay(alt, key);
    return dayIndex >= first && dayIndex < first + alt.days;
  });
}

// --- Resolving ---------------------------------------------------------------

export interface PlanBContext {
  alternatives: PlanAlternative[];
  /** A week's sessions before any Plan B: stored, or projected from its phase. */
  baseWeek: (weekId: string) => Workout[];
  /** The block a virtual Plan B session in `weekId` belongs to. */
  blockIdForWeek?: (weekId: string) => string | undefined;
}

export interface ResolvedOccurrence {
  alt: PlanAlternative;
  key: string;
  firstDay: number;
  lastDay: number;
  /** Set once a side has been chosen - by hand, or by logging a session only that side has. */
  decided?: PlanSide;
  /** The side that counts: decided, else likely. */
  active: PlanSide;
  likely: PlanSide;
  /** Plan A sessions Plan B replaces or drops (tagged). */
  aOnly: Workout[];
  /** Plan B's own sessions - virtual, or stored once logged (tagged). */
  bOnly: Workout[];
  /** Changes whose Plan A session is gone, for people ("Sat: no "Board" any more"). */
  stale: string[];
}

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

function virtualSession(session: WorkoutTemplate, weekId: string, day: DayOfWeek, id: string, blockId: string | undefined): Workout {
  const [w] = generateWorkoutsFromTemplate(weekId, [{ ...session, dayOfWeek: day }], {
    workoutId: () => id,
    slotId: (_t, _slot, i) => `${id}:${i}`,
  });
  return blockId ? { ...w, blockId } : w;
}

export function resolveOccurrence(ctx: PlanBContext, alt: PlanAlternative, key: string): ResolvedOccurrence {
  const firstDay = occurrenceFirstDay(alt, key);
  const lastDay = firstDay + alt.days - 1;
  const occ = occurrenceState(alt, key);
  const aOnly: Workout[] = [];
  const bOnly: Workout[] = [];
  const stale: string[] = [];
  const weekCache = new Map<string, Workout[]>();
  const week = (weekId: string) => {
    let hit = weekCache.get(weekId);
    if (!hit) weekCache.set(weekId, (hit = ctx.baseWeek(weekId)));
    return hit;
  };

  for (const change of [...alt.changes].sort((a, b) => a.offset - b.offset)) {
    if (change.offset < 0 || change.offset >= alt.days) continue;
    const { weekId, day } = weekAndDayOf(firstDay + change.offset);
    const onDay = week(weekId).filter((w) => w.dayOfWeek === day && !isPlanBSessionId(w.id));
    if (change.replaces) {
      const taken = new Set(aOnly.map((w) => w.id));
      const target =
        (change.replaces.id ? onDay.find((w) => w.id === change.replaces!.id && !taken.has(w.id)) : undefined) ??
        onDay.find((w) => !taken.has(w.id) && norm(w.notes) === norm(change.replaces!.name));
      if (target) aOnly.push(target);
      else stale.push(`${day.slice(0, 3)}: no "${change.replaces.name}" in Plan A any more`);
    }
    if (change.session) {
      const id = planBSessionId(alt.id, key, change.id);
      const stored = week(weekId).find((w) => w.id === id);
      bOnly.push(stored ?? virtualSession(change.session, weekId, day, id, ctx.blockIdForWeek?.(weekId)));
    }
  }

  // Logged Plan B sessions whose change has since been removed are still
  // what happened on Plan B's side.
  const prefix = `${PLAN_B_ID_PREFIX}:${alt.id}:${key}:`;
  const seen = new Set(bOnly.map((w) => w.id));
  const firstWeek = weekAndDayOf(firstDay).weekId;
  const lastWeek = weekAndDayOf(lastDay).weekId;
  for (let weekId = firstWeek, guard = 0; guard < 4; weekId = incrementWeekId(weekId), guard++) {
    for (const w of week(weekId)) if (w.id.startsWith(prefix) && !seen.has(w.id)) bOnly.push(w);
    if (weekId >= lastWeek) break;
  }

  const decided: PlanSide | undefined = bOnly.some((w) => w.status === "completed")
    ? "B"
    : aOnly.some((w) => w.status === "completed")
      ? "A"
      : occ.chosen;
  const likely: PlanSide = occ.likely ?? alt.likely ?? "A";
  const active: PlanSide = decided ?? likely;
  const tag = (side: PlanSide, isStale = false): PlanBTag => ({
    altId: alt.id,
    occurrence: key,
    side,
    active: side === active,
    decided: !!decided,
    ...(isStale ? { stale: true as const } : {}),
  });
  return {
    alt,
    key,
    firstDay,
    lastDay,
    decided,
    active,
    likely,
    aOnly: aOnly.map((w) => ({ ...w, planB: tag("A") })),
    bOnly: bOnly.map((w) => ({ ...w, planB: tag("B") })),
    stale,
  };
}

export interface PlanBWeek {
  /** Every session to show: shared ones, both sides' own ones (tagged). */
  shown: Workout[];
  /** What counts: `shown` without the side that doesn't. */
  active: Workout[];
  occurrences: ResolvedOccurrence[];
}

/**
 * Applies every Plan B touching `weekId` to its sessions. With no Plan B
 * there, `shown` and `active` are just the week's own sessions.
 */
export function applyPlanBsToWeek(ctx: PlanBContext, weekId: string): PlanBWeek {
  const base = ctx.baseWeek(weekId);
  const touching = occurrencesTouchingWeek(ctx.alternatives, weekId);
  if (touching.length === 0) return { shown: base, active: base, occurrences: [] };
  const occurrences = touching.map(({ alt, key }) => resolveOccurrence(ctx, alt, key));
  const tagged = new Map<string, Workout>();
  const extra: Workout[] = [];
  const baseIds = new Set(base.map((w) => w.id));
  for (const occ of occurrences) {
    for (const w of occ.aOnly) if (w.weekId === weekId && !tagged.has(w.id)) tagged.set(w.id, w);
    for (const w of occ.bOnly) {
      if (w.weekId !== weekId) continue;
      if (baseIds.has(w.id)) tagged.set(w.id, w);
      else extra.push(w);
    }
  }
  const shown = [...base.map((w) => tagged.get(w.id) ?? w), ...extra];
  return { shown, active: shown.filter((w) => !w.planB || w.planB.active), occurrences };
}

// --- Editing -----------------------------------------------------------------

/** A Plan B session's stored shape, from a session as edited. Plans only - nothing logged comes along. */
export function templateFromWorkout(w: Workout, id: string): WorkoutTemplate {
  return {
    id,
    name: w.notes,
    ...(w.startTime ? { startTime: w.startTime } : {}),
    ...(w.plannedDuration ? { plannedDuration: w.plannedDuration } : {}),
    ...(w.description ? { description: w.description } : {}),
    exercises: w.exercises.map(({ logged: _logged, skipped: _skipped, ...slot }) => slot),
    ...(w.groups?.length ? { groups: w.groups } : {}),
  };
}

export function newPlanB(id: string, weekId: string, day: DayOfWeek): PlanAlternative {
  return { id, startWeekId: weekId, startDay: day, days: 1, changes: [] };
}

/**
 * Stretches a Plan B so that `dayIndex` (a day of occurrence `key`) is part
 * of it. Growing backwards moves the start - and every occurrence key, and
 * every change's offset, with it. Returns `null` past `MAX_PLAN_B_DAYS`.
 */
export function extendToDay(alt: PlanAlternative, key: string, dayIndex: number): { alt: PlanAlternative; key: string; offset: number } | null {
  const first = occurrenceFirstDay(alt, key);
  const offset = dayIndex - first;
  if (offset >= 0) {
    if (offset < alt.days) return { alt, key, offset };
    if (offset >= MAX_PLAN_B_DAYS) return null;
    return { alt: { ...alt, days: offset + 1 }, key, offset };
  }
  const shift = -offset;
  const days = alt.days + shift;
  if (days > MAX_PLAN_B_DAYS) return null;
  const newFirstDay = occurrenceFirstDay(alt, alt.startWeekId) - shift;
  const start = weekAndDayOf(newFirstDay);
  const weekDelta = (dayIndexOf(start.weekId, "Monday") - dayIndexOf(alt.startWeekId, "Monday")) / 7;
  const moveKey = (k: string) => (weekDelta === 0 ? k : weekAndDayOf(dayIndexOf(k, "Monday") + weekDelta * 7).weekId);
  const next: PlanAlternative = {
    ...alt,
    startWeekId: start.weekId,
    startDay: start.day,
    days,
    changes: alt.changes.map((c) => ({ ...c, offset: c.offset + shift })),
    ...(alt.repeatUntilWeekId ? { repeatUntilWeekId: moveKey(alt.repeatUntilWeekId) } : {}),
    ...(alt.occurrences ? { occurrences: Object.fromEntries(Object.entries(alt.occurrences).map(([k, v]) => [moveKey(k), v])) } : {}),
  };
  return { alt: next, key: moveKey(key), offset: 0 };
}

/**
 * What saving `edited` while editing Plan B does to the Plan B.
 *
 *  - one of Plan B's own sessions: its change gets the new session (and
 *    moves if its day changed)
 *  - a session both plans share: Plan B gets its own version, replacing
 *    that one - Plan A keeps the original
 *  - a new session: Plan B adds it
 *
 * `null` if the session's day is too far away to join the stretch.
 */
export function saveInPlanB(
  alt: PlanAlternative,
  key: string,
  edited: Workout,
  original: Workout | undefined,
  newId: () => string,
): { alt: PlanAlternative; key: string } | null {
  if (!edited.dayOfWeek) return null;
  const extended = extendToDay(alt, key, dayIndexOf(edited.weekId, edited.dayOfWeek));
  if (!extended) return null;
  const { alt: grown, key: newKey, offset } = extended;
  const own = parsePlanBSessionId(edited.id);
  if (own && own.altId === alt.id) {
    const changes = grown.changes.map((c) =>
      c.id === own.changeId ? { ...c, offset, session: templateFromWorkout(edited, c.session?.id ?? newId()) } : c,
    );
    return { alt: { ...grown, changes }, key: newKey };
  }
  const change: PlanBChange = {
    id: newId(),
    offset,
    ...(original ? { replaces: { name: original.notes || "Session", id: original.id } } : {}),
    session: templateFromWorkout(edited, newId()),
  };
  return { alt: { ...grown, changes: [...grown.changes, change] }, key: newKey };
}

/**
 * What deleting `workout` while editing Plan B does: Plan B's own session
 * goes (a swap becomes a plain drop of the Plan A session); a shared one is
 * dropped from Plan B only.
 */
export function deleteInPlanB(alt: PlanAlternative, key: string, workout: Workout, newId: () => string): PlanAlternative {
  const own = parsePlanBSessionId(workout.id);
  if (own && own.altId === alt.id) {
    const changes = alt.changes
      .map((c) => (c.id === own.changeId ? (c.replaces ? { id: c.id, offset: c.offset, replaces: c.replaces } : null) : c))
      .filter((c): c is PlanBChange => c !== null);
    return { ...alt, changes };
  }
  if (!workout.dayOfWeek) return alt;
  const extended = extendToDay(alt, key, dayIndexOf(workout.weekId, workout.dayOfWeek));
  if (!extended) return alt;
  const change: PlanBChange = { id: newId(), offset: extended.offset, replaces: { name: workout.notes || "Session", id: workout.id } };
  return { ...extended.alt, changes: [...extended.alt.changes, change] };
}

/** Undoes Plan B's difference for one session: it goes back to being the same in both plans. */
export function revertInPlanB(alt: PlanAlternative, workout: Workout): PlanAlternative {
  const own = parsePlanBSessionId(workout.id);
  if (own && own.altId === alt.id) return { ...alt, changes: alt.changes.filter((c) => c.id !== own.changeId) };
  return {
    ...alt,
    changes: alt.changes.filter((c) => !(c.replaces && (c.replaces.id === workout.id || norm(c.replaces.name) === norm(workout.notes)) && !c.session)),
  };
}

export function setOccurrence(alt: PlanAlternative, key: string, patch: Partial<PlanBOccurrence>): PlanAlternative {
  const merged: PlanBOccurrence = { ...occurrenceState(alt, key), ...patch };
  for (const k of Object.keys(merged) as (keyof PlanBOccurrence)[]) if (merged[k] === undefined) delete merged[k];
  const occurrences = { ...(alt.occurrences ?? {}) };
  if (Object.keys(merged).length) occurrences[key] = merged;
  else delete occurrences[key];
  const { occurrences: _old, ...rest } = alt;
  return Object.keys(occurrences).length ? { ...rest, occurrences } : rest;
}

// --- Describing --------------------------------------------------------------

const SHORT = (d: DayOfWeek) => d.slice(0, 3);

/** "Sat" / "Sat–Mon" for an occurrence. */
export function occurrenceDaysLabel(alt: PlanAlternative, key: string): string {
  const first = occurrenceFirstDay(alt, key);
  const a = weekAndDayOf(first).day;
  if (alt.days === 1) return SHORT(a);
  return `${SHORT(a)}–${SHORT(weekAndDayOf(first + alt.days - 1).day)}`;
}

/** "Plan B: outdoor Sat, rest Mon" style list of what Plan B does differently. */
export function describeChanges(alt: PlanAlternative, key: string = alt.startWeekId): string[] {
  const first = occurrenceFirstDay(alt, key);
  return [...alt.changes]
    .sort((a, b) => a.offset - b.offset)
    .map((c) => {
      const day = SHORT(weekAndDayOf(first + c.offset).day);
      if (c.replaces && c.session) return `${day}: ${c.session.name || "Session"} instead of ${c.replaces.name}`;
      if (c.replaces) return `${day}: no ${c.replaces.name}`;
      return `${day}: + ${c.session?.name || "Session"}`;
    });
}

/**
 * The days ("YYYY-MM-DD") that only `side` has sessions on - where the
 * weather decides between the plans. Falls back to the stretch's first day
 * when that side only drops sessions.
 */
export function sideDates(occ: ResolvedOccurrence, side: PlanSide): string[] {
  const own = side === "A" ? occ.aOnly : occ.bOnly;
  const days = own
    .filter((w) => w.dayOfWeek)
    .map((w) => isoOfDay(dayIndexOf(w.weekId, w.dayOfWeek!)));
  return days.length ? [...new Set(days)].sort() : [isoOfDay(occ.firstDay)];
}

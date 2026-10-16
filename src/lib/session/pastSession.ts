import type { Workout } from "../types";
import { WEEK_DAYS } from "../constants";
import { weekIdOfIso, localIsoDate } from "../dateUtils";

/**
 * "Log a past session": a session you already did, added after the fact.
 * It is an ordinary done session - a stored row with its date, its week and
 * weekday - so every reader (History, Analytics, `getWorkoutsForWeek`) sees
 * it like any other. Nothing about the data model is new; this only builds
 * the starting point the editor then fills with exercises and sets. Pure.
 */

export interface PastSessionInput {
  id: string;
  /** The day it happened, "YYYY-MM-DD". */
  day: string;
  /** Start time "HH:MM"; empty = midday. */
  time?: string;
  blockId?: string;
  notes?: string;
}

/** Why a day/time cannot be logged, or null when it can. A past session cannot be in the future. */
export function pastSessionProblem(day: string, time: string | undefined, now: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Pick the day it happened.";
  const at = momentOf(day, time);
  if (Number.isNaN(at.getTime())) return "Pick the day it happened.";
  if (at.getTime() > now.getTime()) return "That is in the future. Plan it instead, or pick a day that has passed.";
  return null;
}

function momentOf(day: string, time?: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = (time || "12:00").split(":").map(Number);
  return new Date(y, m - 1, d, h || 0, min || 0);
}

/** The weekday name of a "YYYY-MM-DD" day. */
function weekdayOf(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return WEEK_DAYS[(new Date(y, m - 1, d, 12).getDay() + 6) % 7];
}

/** A done session on that day, with no exercises yet; null when the day/time is not a past one. */
export function buildPastSession(input: PastSessionInput, now: Date = new Date()): Workout | null {
  if (pastSessionProblem(input.day, input.time, now)) return null;
  return {
    id: input.id,
    status: "completed",
    date: momentOf(input.day, input.time).toISOString(),
    weekId: weekIdOfIso(input.day),
    dayOfWeek: weekdayOf(input.day),
    ...(input.time ? { startTime: input.time } : {}),
    notes: input.notes ?? "Session",
    loadFactor: 0,
    exercises: [],
    ...(input.blockId ? { blockId: input.blockId } : {}),
  };
}

/** Yesterday's date (the usual "I forgot to log it") for a date field's start value. */
export function defaultPastDay(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  return localIsoDate(d);
}

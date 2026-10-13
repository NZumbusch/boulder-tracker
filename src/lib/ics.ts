import type { DayOfWeek, ExerciseTypeDef, Workout } from './types';
import { getWeekIdRange, localIsoDate } from './dateUtils';
import { estimateSessionDuration, sessionDuration } from './planning/sessionDuration';
import { parseStartTime, sessionDay, DAY_MS } from './planning/calendarEvents';
import { summarizeSession } from './planning/sessionSummary';
import { saveFile } from './share/saveFile';

const DAY_OFFSET: Record<DayOfWeek, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6,
};

/**
 * Local midnight of a day in an ISO week (Monday when no day is given).
 * Calendar arithmetic, not adding 24 hours: across a daylight-saving change
 * the latter lands an hour off and can slip a day.
 */
export function getDateFromWeekId(weekId: string, dayOfWeek?: DayOfWeek): Date {
  const [yearStr, weekStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);

  // January 4th is always in week 1.
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7; // Monday = 0
  return new Date(year, 0, 4 - jan4Day + (week - 1) * 7 + (dayOfWeek ? DAY_OFFSET[dayOfWeek] : 0));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A local date and time as an iCalendar "floating" value - shown as that wall-clock time wherever it is opened. */
function localStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]|\.\d{3}/g, '');
}

/** Text values escape backslash, semicolon, comma and newlines. */
function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Content lines are at most 75 bytes; a longer one continues on the next line after a space. Never splits a character. */
function fold(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = ' ';
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out;
}

export interface IcsOptions {
  /** Names the exercises in each event's description. */
  exerciseTypes?: ExerciseTypeDef[];
  now?: Date;
}

export function generateICS(workouts: Workout[], { exerciseTypes, now = new Date() }: IcsOptions = {}): string {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BoulderTracker//EN', 'CALSCALE:GREGORIAN'];
  const push = (line: string) => out.push(...fold(line));

  for (const w of workouts) {
    // Where the session is on the calendar: a finished one on the day it happened, a planned one on its week and day.
    const day = sessionDay(w);
    if (day === null) continue;
    const d = new Date(day * DAY_MS);
    const startMin = parseStartTime(w.startTime) ?? 12 * 60;
    const start = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, startMin);
    const minutes = Math.round(w.status === 'completed' ? sessionDuration(w) : estimateSessionDuration(w));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, startMin + minutes);

    const details = [w.description?.trim(), exerciseTypes ? summarizeSession(w, exerciseTypes, 50).exerciseNames.join(', ') : '']
      .filter(Boolean)
      .join('\n');

    out.push('BEGIN:VEVENT');
    push(`UID:${w.id}@bouldertracker`);
    push(`DTSTAMP:${utcStamp(now)}`);
    push(`DTSTART:${localStamp(start)}`);
    push(`DTEND:${localStamp(end)}`);
    push(`SUMMARY:${escapeText(w.notes || 'Workout Session')}`);
    if (details) push(`DESCRIPTION:${escapeText(details)}`);
    out.push('END:VEVENT');
  }

  out.push('END:VCALENDAR');
  return out.join('\r\n');
}

/**
 * The weeks an export reads: from this week (or the first logged session,
 * with `includePast`) to the end of the plan or the last stored session,
 * whichever is later.
 */
export function exportWeekIds(args: {
  currentWeekId: string;
  workouts: Pick<Workout, 'weekId'>[];
  blocks: { startWeekId: string; endWeekId: string }[];
  includePast: boolean;
}): string[] {
  const stored = args.workouts.map((w) => w.weekId).sort();
  const from = args.includePast && stored.length > 0 && stored[0] < args.currentWeekId ? stored[0] : args.currentWeekId;
  const ends = [from, ...(stored.length ? [stored[stored.length - 1]] : []), ...args.blocks.map((b) => b.endWeekId)];
  return getWeekIdRange(from, ends.sort().at(-1)!);
}

export function exportWorkoutsToICS(workouts: Workout[], options?: IcsOptions) {
  void saveFile({
    content: generateICS(workouts, options),
    fileName: `boulder-tracker-workouts-${localIsoDate()}.ics`,
    mimeType: 'text/calendar',
    title: 'Boulder Tracker calendar',
  });
}

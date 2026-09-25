/**
 * The Analytics time window: a range preset, paged a whole window at a
 * time, split into the columns the charts draw ("buckets").
 *
 * Short ranges are drawn a week per column. A year of weekly columns
 * would be 52 slivers on a phone, so the year view groups by month
 * instead - a week belongs to the month its Thursday falls in (the same
 * rule ISO uses to give a week to a year), so every week lands in exactly
 * one month.
 *
 * Days are day indices (days since the epoch, as `toUtcDayIndex` counts
 * them), so a bucket's span can be compared with sessions, metrics and
 * ascents without time-zone arithmetic.
 */
import { getWeekId, getWeekDates } from "../dateUtils";
import { weekWindowOffsets } from "./chartWindow";

export type AnalyticsRange = "4w" | "3m" | "6m" | "1y";
export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ["4w", "3m", "6m", "1y"];
export const RANGE_LABELS: Record<AnalyticsRange, string> = { "4w": "4W", "3m": "3M", "6m": "6M", "1y": "1Y" };
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = "3m";

/** Weekly ranges, in weeks. */
const RANGE_WEEKS: Record<Exclude<AnalyticsRange, "1y">, number> = { "4w": 4, "3m": 13, "6m": 26 };
const YEAR_MONTHS = 12;

export interface Bucket {
  /** A week id ("2026-W34") or a month key ("2026-09"). */
  id: string;
  kind: "week" | "month";
  /** Axis-ready: "W34" or "Sep". */
  label: string;
  /** The ISO weeks this column covers, in order - one for a week bucket. */
  weekIds: string[];
  /** First and last day index covered, inclusive (Monday of the first week, Sunday of the last). */
  startDay: number;
  endDay: number;
  /** Whether `today` falls inside it. */
  isCurrent: boolean;
}

const DAY_MS = 86400000;

/** Monday of an ISO week, as a day index. */
export function weekStartDay(weekId: string): number | undefined {
  const dates = getWeekDates(weekId);
  return dates ? Math.floor(dates.start.getTime() / DAY_MS) : undefined;
}

/** The ISO week containing a day index. */
function weekIdOfDay(day: number): string {
  const d = new Date(day * DAY_MS);
  // getWeekId reads local date parts; hand it local noon of the same calendar day.
  return getWeekId(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
}

function monthKeyOfDay(day: number): string {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Just the month - the header already spells out the window's years, and "Jan ’26" wraps on a phone axis. */
function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 15)).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
}

function weekBucket(weekId: string, today: number): Bucket {
  const startDay = weekStartDay(weekId) ?? 0;
  const endDay = startDay + 6;
  return {
    id: weekId,
    kind: "week",
    label: `W${weekId.split("-W")[1]}`,
    weekIds: [weekId],
    startDay,
    endDay,
    isCurrent: today >= startDay && today <= endDay,
  };
}

/**
 * The columns for `range`, paged `viewOffset` whole windows from the
 * current one (0 = the window containing today, -1 = the one before it).
 *
 * `now` is a local date; `today` is its day index.
 */
export function buildBuckets(range: AnalyticsRange, viewOffset: number, now: Date = new Date()): Bucket[] {
  const today = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);

  if (range !== "1y") {
    // Same window rule the charts always used: a couple of weeks of plan
    // ahead of today stay in view - see `weekWindowOffsets`.
    const { startOffset, endOffset } = weekWindowOffsets(RANGE_WEEKS[range], viewOffset);
    const buckets: Bucket[] = [];
    for (let i = startOffset; i <= endOffset; i++) buckets.push(weekBucket(weekIdOfDay(today + i * 7), today));
    return buckets;
  }

  // Twelve months ending with the current month (shifted a year per page).
  const lastMonthIndex = now.getFullYear() * 12 + now.getMonth() + viewOffset * YEAR_MONTHS;
  const months = Array.from({ length: YEAR_MONTHS }, (_, i) => {
    const index = lastMonthIndex - (YEAR_MONTHS - 1) + i;
    return { year: Math.floor(index / 12), month: index % 12 };
  });

  // Every Monday whose week could touch these months, grouped by the month
  // its Thursday is in.
  const firstDay = Date.UTC(months[0].year, months[0].month, 1) / DAY_MS - 7;
  const lastDay = Date.UTC(months[YEAR_MONTHS - 1].year, months[YEAR_MONTHS - 1].month + 1, 0) / DAY_MS + 7;
  const byMonth = new Map<string, { weekIds: string[]; startDay: number; endDay: number }>();
  const firstMonday = firstDay - ((new Date(firstDay * DAY_MS).getUTCDay() + 6) % 7);
  for (let monday = firstMonday; monday <= lastDay; monday += 7) {
    const key = monthKeyOfDay(monday + 3);
    const entry = byMonth.get(key) ?? { weekIds: [], startDay: monday, endDay: monday + 6 };
    entry.weekIds.push(weekIdOfDay(monday));
    entry.endDay = monday + 6;
    byMonth.set(key, entry);
  }

  return months.map(({ year, month }) => {
    const id = `${year}-${String(month + 1).padStart(2, "0")}`;
    const entry = byMonth.get(id)!;
    return {
      id,
      kind: "month" as const,
      label: monthLabel(year, month),
      weekIds: entry.weekIds,
      startDay: entry.startDay,
      endDay: entry.endDay,
      isCurrent: today >= entry.startDay && today <= entry.endDay,
    };
  });
}

/**
 * Where a day sits across the bucket columns, as a 0-100 x position.
 * Columns are equal width even when months are not equal length, so this
 * interpolates within the day's own column rather than across the whole
 * window. Days outside the window clamp to its edges.
 */
export function dayToX(buckets: Bucket[], day: number): number {
  if (buckets.length === 0) return 0;
  const n = buckets.length;
  if (day < buckets[0].startDay) return 0;
  for (let i = 0; i < n; i++) {
    const b = buckets[i];
    if (day <= b.endDay) {
      const span = b.endDay - b.startDay + 1;
      return ((i + (day - b.startDay) / span) / n) * 100;
    }
  }
  return 100;
}

/** The bucket a day falls in, if any. */
export function bucketOfDay(buckets: Bucket[], day: number): Bucket | undefined {
  return buckets.find((b) => day >= b.startDay && day <= b.endDay);
}

import type { GarminRecord } from "../types";
import { hashOf, stableStringify } from "../sync/merge";

/**
 * The Garmin data export, kept as it is for later: every row of the files
 * that hold your training and health data, unstructured (`data` is the row
 * exactly as Garmin wrote it), one record per row. Nothing here is read for
 * a screen or a prompt; the parts the app uses (activities, daily values)
 * are made from the same rows at import. When a question comes up that
 * today's import ignores (skin temperature, sleep stress, intensity minutes,
 * Body Battery over the night...), the data is already here.
 *
 * Importing never duplicates: a record is named by what it is (`<kind>:<key>`,
 * the activity id, the calendar day...), so the same row from a second
 * export - or from a second device's sync - is the same record, and an export
 * with changed values replaces the old ones. Identity and contact files,
 * devices, courses, messages and the recordings themselves (FIT files) are
 * not kept. Pure.
 */

type Json = Record<string, any>;

interface Source {
  kind: string;
  /** The file's name, not its folder. */
  file: RegExp;
  /** A file that wraps its rows ({ summarizedActivitiesExport: [...] }): wrapper key -> kind of the rows inside. */
  wraps?: Record<string, string>;
  /** Fields that name a row, the first one it has; without any the row is keyed by its content. */
  key: string[] | ((row: Json) => string | undefined);
}

const dayOf = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);

export const ARCHIVE_SOURCES: Source[] = [
  { kind: "activity", file: /_summarizedActivities\.json$/i, wraps: { summarizedActivitiesExport: "activity" }, key: ["activityId"] },
  { kind: "day", file: /^UDSFile_.*\.json$/i, key: (r) => dayOf(r.calendarDate) },
  { kind: "hydration", file: /^HydrationLogFile_.*\.json$/i, key: ["uuid"] },
  { kind: "sleep", file: /_sleepData\.json$/i, key: (r) => dayOf(r.calendarDate) },
  { kind: "healthStatus", file: /_healthStatusData\.json$/i, key: (r) => dayOf(r.calendarDate) },
  { kind: "fitnessAge", file: /_fitnessAgeData\.json$/i, key: (r) => dayOf(r.asOfDateGmt) },
  { kind: "wellnessActivity", file: /_wellnessActivities\.json$/i, key: ["startTimestampGMT"] },
  { kind: "weight", file: /_userBioMetrics\.json$/i, key: (r) => (typeof r.weight?.timestampGMT === "string" ? r.weight.timestampGMT : undefined) },
  { kind: "bioProfile", file: /_userBioMetricProfileData\.json$/i, key: () => "latest" },
  { kind: "bioLatest", file: /_bioMetrics_latest\.json$/i, key: () => "latest" },
  { kind: "hrZones", file: /_heartRateZones\.json$/i, key: (r) => String(r.sport ?? "DEFAULT") },
  { kind: "maxMet", file: /^MetricsMaxMetData_.*\.json$/i, key: (r) => (dayOf(r.calendarDate) ? `${dayOf(r.calendarDate)}|${r.sport ?? ""}|${r.subSport ?? ""}` : undefined) },
  { kind: "personalRecord", file: /_personalRecord\.json$/i, wraps: { personalRecords: "personalRecord" }, key: ["personalRecordPk", "id"] },
  { kind: "weeklyReport", file: /_weekly_training_report\.json$/i, wraps: { weeklyTrainingReportExport: "weeklyReport" }, key: [] },
  { kind: "workout", file: /_workout\.json$/i, wraps: { workoutList: "workout", workoutScheduleList: "workoutSchedule" }, key: ["workoutId", "scheduleId", "id"] },
  { kind: "gear", file: /_gear\.json$/i, key: ["gearPk", "uuid"] },
  { kind: "trainingPlan", file: /_trainingPlan\.json$/i, key: ["trainingPlanId", "id"] },
  { kind: "goal", file: /^UserGoal_.*\.json$/i, key: [] },
  { kind: "abnormalHr", file: /_AbnormalHrEvents\.json$/i, key: ["abnormalHrEventGMT"] },
  { kind: "nutrition", file: /_nutritionLogs\.json$/i, key: [] },
  { kind: "coachPause", file: /^Garmin_Coach_Pause_History\.json$/i, key: [] },
];

/** The file name from a path, either slash. */
const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** The source that reads a file, by its name; undefined for a file that is not kept. */
export function archiveSourceFor(path: string): Source | undefined {
  const name = baseName(path);
  return ARCHIVE_SOURCES.find((s) => s.file.test(name));
}

function keyOf(source: Source, row: Json): string {
  const fields = typeof source.key === "function" ? undefined : source.key;
  const raw = typeof source.key === "function" ? source.key(row) : fields!.map((f) => row[f]).find((v) => typeof v === "string" || typeof v === "number");
  // A row with nothing that names it is named by its content: the same row twice is one, a changed one is another.
  return raw !== undefined && raw !== "" ? String(raw) : `#${hashOf(row)}`;
}

/** The records one parsed file holds. */
export function archiveRecords(path: string, parsed: unknown): GarminRecord[] {
  const source = archiveSourceFor(path);
  if (!source) return [];
  const out: GarminRecord[] = [];
  const add = (kind: string, row: unknown) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) return;
    const key = keyOf(source, row as Json);
    out.push({ id: `${kind}:${key}`, kind, key, data: row });
  };
  const top: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of top) {
    if (source.wraps && item && typeof item === "object") {
      for (const [wrapper, kind] of Object.entries(source.wraps)) {
        const inner = (item as Json)[wrapper];
        if (Array.isArray(inner)) for (const row of inner) add(kind, row);
      }
    } else {
      add(source.kind, item);
    }
  }
  return out;
}

/** Records with a repeated id reduced to one (the fuller row, when two exports overlap on a day). */
export function collapseRecords(records: GarminRecord[]): GarminRecord[] {
  const by = new Map<string, GarminRecord>();
  for (const r of records) {
    const have = by.get(r.id);
    if (!have || stableStringify(r.data).length > stableStringify(have.data).length) by.set(r.id, r);
  }
  return [...by.values()];
}

export interface ArchivePlan {
  /** Not stored yet. */
  add: GarminRecord[];
  /** Stored, with other values: the incoming ones replace them. */
  change: GarminRecord[];
  /** Stored and the same. */
  same: number;
}

/** What storing `incoming` would do to `existing`. */
export function planArchive(existing: GarminRecord[], incoming: GarminRecord[]): ArchivePlan {
  const have = new Map(existing.map((r) => [r.id, hashOf(r.data)]));
  const plan: ArchivePlan = { add: [], change: [], same: 0 };
  for (const r of collapseRecords(incoming)) {
    const h = have.get(r.id);
    if (h === undefined) plan.add.push(r);
    else if (h !== hashOf(r.data)) plan.change.push(r);
    else plan.same++;
  }
  return plan;
}

/** `existing` with the plan applied: changed records replaced where they were, new ones after. */
export function applyArchive(existing: GarminRecord[], plan: ArchivePlan): GarminRecord[] {
  const changed = new Map(plan.change.map((r) => [r.id, r]));
  return [...existing.map((r) => changed.get(r.id) ?? r), ...plan.add];
}

export interface ArchiveInfo {
  records: number;
  /** Records per kind, biggest first. */
  kinds: { kind: string; records: number }[];
  /** The stored size as JSON, bytes (approximate). */
  bytes: number;
}

export function archiveInfo(records: GarminRecord[]): ArchiveInfo {
  const kinds = new Map<string, number>();
  for (const r of records) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  return {
    records: records.length,
    kinds: [...kinds].map(([kind, n]) => ({ kind, records: n })).sort((a, b) => b.records - a.records),
    bytes: records.length ? JSON.stringify(records).length : 0,
  };
}

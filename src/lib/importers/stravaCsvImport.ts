import type { ExternalActivity } from "../types";
import { localIsoDate } from "../dateUtils";
import { parseCsvRows } from "./outdoorAscentCsvImport";

/**
 * Parses the `activities.csv` of a Strava bulk export (Strava → Settings →
 * My Account → Download or delete your account → Request your archive)
 * into `ExternalActivity[]`.
 *
 * The export repeats some column names: the first "Elapsed Time" and
 * "Distance" are the summary ones, the later pair (seconds, metres) sit
 * among the detail columns. The later one is used when it has a value.
 * The column layout is written from the format as published, not from a
 * real export - a header without "Activity ID" and "Activity Date" is
 * refused instead of guessed at, and every other column is optional.
 *
 * Dates in the file are UTC ("Oct 5, 2024, 6:30:00 AM"); the day an
 * activity belongs to is the local day it started on.
 */

export interface StravaImportResult {
  activities: ExternalActivity[];
  skipped: { line: number; reason: string }[];
  /** The archive file each activity was recorded in (`activities/123.fit.gz`), by activity id, when the row names one. */
  filenames: Record<string, string>;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Oct 5, 2024, 6:30:00 AM" (UTC) or an ISO date → epoch ms; NaN when neither. */
export function parseStravaDate(text: string): number {
  const m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i.exec(text.trim());
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    if (month === -1) return NaN;
    let hour = Number(m[4]);
    if (m[7]) hour = (hour % 12) + (m[7].toUpperCase() === "PM" ? 12 : 0);
    return Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5]), Number(m[6] ?? 0));
  }
  return /^\d{4}-\d{2}-\d{2}/.test(text.trim()) ? Date.parse(text.trim()) : NaN;
}

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value.trim().replace(",", "."));
  return value.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

const positive = (n: number | undefined) => (n !== undefined && n > 0 ? n : undefined);

export function parseStravaCsv(csvText: string): StravaImportResult {
  const rows = parseCsvRows(csvText.replace(/^﻿/, ""));
  const activities: ExternalActivity[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const filenames: Record<string, string> = {};
  if (rows.length === 0) return { activities, skipped, filenames };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const first = (name: string) => header.indexOf(name);
  const last = (name: string) => header.lastIndexOf(name);

  const idCol = first("activity id");
  const dateCol = first("activity date");
  if (idCol === -1 || dateCol === -1) {
    skipped.push({ line: 1, reason: "Missing 'Activity ID' and/or 'Activity Date' column - not a Strava activities.csv" });
    return { activities, skipped, filenames };
  }
  const nameCol = first("activity name");
  const typeCol = first("activity type");
  const noteCol = first("activity description");
  const maxHrCol = first("max heart rate");
  const avgHrCol = first("average heart rate");
  const fileCol = first("filename");
  const caloriesCol = first("calories");
  const elevationCol = first("elevation gain");
  const cell = (row: string[], col: number) => (col === -1 ? undefined : row[col]);
  /** The later of a repeated column when it holds a number, else the first. */
  const repeated = (row: string[], name: string) => positive(num(cell(row, last(name)))) ?? positive(num(cell(row, first(name))));

  const seen = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sourceId = (row[idCol] ?? "").trim();
    const startMs = parseStravaDate(row[dateCol] ?? "");
    if (!sourceId) {
      skipped.push({ line: i + 1, reason: "Missing activity id" });
      continue;
    }
    if (Number.isNaN(startMs)) {
      skipped.push({ line: i + 1, reason: "Unreadable date" });
      continue;
    }
    if (seen.has(sourceId)) {
      skipped.push({ line: i + 1, reason: "Repeated activity id" });
      continue;
    }
    seen.add(sourceId);

    const type = (cell(row, typeCol) ?? "").trim() || "Activity";
    const activity: ExternalActivity = {
      id: `strava-${sourceId}`,
      source: "strava",
      sourceId,
      date: localIsoDate(new Date(startMs)),
      start: new Date(startMs).toISOString(),
      name: (cell(row, nameCol) ?? "").trim() || type,
      type,
      durationSec: Math.round(repeated(row, "elapsed time") ?? 0),
    };
    // With two "Distance" columns the later one is metres; the summary one (or a lone column) is kilometres.
    const detail = last("distance") !== first("distance") ? positive(num(cell(row, last("distance")))) : undefined;
    const summaryKm = positive(num(cell(row, first("distance"))));
    const metres = detail ?? (summaryKm ? summaryKm * 1000 : undefined);
    if (metres) activity.distanceM = Math.round(metres);
    const moving = positive(num(cell(row, first("moving time"))));
    if (moving) activity.movingSec = Math.round(moving);
    const elevation = positive(num(cell(row, elevationCol)));
    if (elevation) activity.elevationM = Math.round(elevation);
    const avgHr = positive(num(cell(row, avgHrCol)));
    if (avgHr) activity.avgHr = Math.round(avgHr);
    const maxHr = positive(num(cell(row, maxHrCol)));
    if (maxHr) activity.maxHr = Math.round(maxHr);
    const calories = positive(num(cell(row, caloriesCol)));
    if (calories) activity.calories = Math.round(calories);
    const notes = (cell(row, noteCol) ?? "").trim();
    if (notes) activity.notes = notes;
    const file = (cell(row, fileCol) ?? "").trim();
    if (file) filenames[sourceId] = file;
    activities.push(activity);
  }
  return { activities, skipped, filenames };
}

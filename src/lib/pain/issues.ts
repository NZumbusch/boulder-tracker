import type { PainIssue, PainLog, PainRegion, PainSide, PainTrend, PainKind, PainTiming, Workout, ExerciseTypeDef, AnalyticsCategory } from "../types";
import { getWeekId } from "../dateUtils";

/**
 * Pain issues and their check-ins. Pure: storage, state
 * and the UI all read the same answers from here.
 */

/** A new issue starts when the same body part comes back after more than this many days. */
export const ISSUE_GAP_DAYS = 21;

export function normalizeBodyPart(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / 86_400_000);
export const daysBetween = (fromIso: string, toIso: string) => dayNumber(toIso) - dayNumber(fromIso);

export const issueIdFor = (firstLogId: string) => `pain-issue-${firstLogId}`;

const byDate = (a: PainLog, b: PainLog) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

/**
 * The 3.32 -> 3.33 migration: loose pain entries grouped into issues -
 * per body part, a new issue after a gap of more than `ISSUE_GAP_DAYS`.
 * Ids are derived from the first entry, so two devices migrating the same
 * entries get the same issues (sync merges them rather than doubling).
 *
 * Pure (no clock): an issue is closed at its last entry when that entry
 * is more than `ISSUE_GAP_DAYS` older than the newest pain entry in the
 * data (`endEstimated`); the rest stay active and get asked about.
 */
export function groupLogsIntoIssues(logs: PainLog[]): { issues: PainIssue[]; logs: PainLog[] } {
  const sorted = [...logs].sort(byDate);
  const newest = sorted.length ? sorted[sorted.length - 1].date : undefined;
  const open = new Map<string, { issue: PainIssue; last: string }>();
  const issues: PainIssue[] = [];
  const out: PainLog[] = [];

  for (const log of sorted) {
    if (log.issueId) {
      out.push(log);
      continue;
    }
    const key = normalizeBodyPart(log.bodyPart);
    let current = open.get(key);
    if (!current || daysBetween(current.last, log.date) > ISSUE_GAP_DAYS) {
      const issue: PainIssue = { id: issueIdFor(log.id), bodyPart: log.bodyPart.trim(), startDate: log.date.slice(0, 10) };
      issues.push(issue);
      current = { issue, last: log.date };
      open.set(key, current);
    }
    current.last = log.date;
    out.push({ ...log, issueId: current.issue.id });
  }

  if (newest) {
    for (const issue of issues) {
      const last = out.filter((l) => l.issueId === issue.id).map((l) => l.date).sort().pop()!;
      if (daysBetween(last, newest) > ISSUE_GAP_DAYS) {
        issue.endDate = last.slice(0, 10);
        issue.endEstimated = true;
      }
    }
  }
  return { issues, logs: out };
}

/**
 * Load-time repair: an entry without an issue (saved by an older app
 * version on another device) joins the open issue for its body part, or
 * starts one - with the same deterministic id the migration would give.
 */
export function attachOrphanLogs(logs: PainLog[], issues: PainIssue[]): { logs: PainLog[]; issues: PainIssue[]; changed: boolean } {
  if (!logs.some((l) => !l.issueId)) return { logs, issues, changed: false };
  const nextIssues = [...issues];
  const nextLogs = [...logs].sort(byDate).map((log) => {
    if (log.issueId) return log;
    const key = normalizeBodyPart(log.bodyPart);
    const match = nextIssues.find((i) => normalizeBodyPart(i.bodyPart) === key && i.startDate <= log.date.slice(0, 10) && (!i.endDate || i.endDate >= log.date.slice(0, 10)));
    if (match) return { ...log, issueId: match.id };
    const id = issueIdFor(log.id);
    if (!nextIssues.some((i) => i.id === id)) nextIssues.push({ id, bodyPart: log.bodyPart.trim(), startDate: log.date.slice(0, 10) });
    return { ...log, issueId: id };
  });
  return { logs: nextLogs, issues: nextIssues, changed: true };
}

/** An issue's check-ins, oldest first. */
export function checkInsFor(issueId: string, logs: PainLog[]): PainLog[] {
  return logs.filter((l) => l.issueId === issueId).sort(byDate);
}

export type IssueStatus = "resolved" | "worse" | "improving" | "steady" | "new";

export interface IssueState {
  status: IssueStatus;
  /** Latest check-in's severity (0 once gone), undefined with none. */
  severity: number | undefined;
  peak: number;
  lastCheckIn: string | undefined;
  /** Days since the last check-in (or since it started, with none). */
  daysSinceCheckIn: number;
  /** Days from start to end (resolved) or to today. */
  durationDays: number;
  checkIns: number;
}

/** Where an issue stands on `todayIso`. */
export function issueState(issue: PainIssue, logs: PainLog[], todayIso: string): IssueState {
  const own = checkInsFor(issue.id, logs);
  const latest = own[own.length - 1];
  const prev = own[own.length - 2];
  const severity = latest?.severity;
  let status: IssueStatus;
  if (issue.endDate) status = "resolved";
  else if (!latest || own.length === 1) status = latest?.trend === "worse" ? "worse" : latest?.trend === "better" ? "improving" : "new";
  else if (latest.trend === "worse" || (prev && latest.severity > prev.severity)) status = "worse";
  else if (latest.trend === "better" || (prev && latest.severity < prev.severity)) status = "improving";
  else status = "steady";
  return {
    status,
    severity,
    peak: Math.max(0, ...own.map((l) => l.severity)),
    lastCheckIn: latest?.date.slice(0, 10),
    daysSinceCheckIn: daysBetween(latest?.date ?? issue.startDate, todayIso),
    durationDays: daysBetween(issue.startDate, issue.endDate ?? todayIso),
    checkIns: own.length,
  };
}

export const isActive = (issue: PainIssue) => !issue.endDate;

/** Active issues without a check-in today - what the Home card asks about. */
export function dueToday(issues: PainIssue[], logs: PainLog[], todayIso: string): PainIssue[] {
  return issues.filter((i) => isActive(i) && i.startDate <= todayIso && !checkInsFor(i.id, logs).some((l) => l.date.slice(0, 10) === todayIso));
}

/** Active issues with no check-in for at least `days` days - the stale prompt and the reminder. */
export function unCheckedFor(issues: PainIssue[], logs: PainLog[], todayIso: string, days: number): PainIssue[] {
  return issues.filter((i) => isActive(i) && issueState(i, logs, todayIso).daysSinceCheckIn >= days);
}

/**
 * A one-tap check-in: the entry to save and the issue as it is after it
 * ("gone" closes it today). Severity moves one step from the last one
 * unless given.
 */
export function checkIn(
  issue: PainIssue,
  logs: PainLog[],
  trend: PainTrend,
  todayIso: string,
  newId: () => string,
  extra: Partial<Pick<PainLog, "severity" | "notes" | "kinds" | "timing">> = {},
): { log: PainLog; issue: PainIssue } {
  const last = checkInsFor(issue.id, logs).pop()?.severity ?? 3;
  const severity = extra.severity ?? (trend === "gone" ? 0 : trend === "better" ? Math.max(1, last - 1) : trend === "worse" ? Math.min(10, last + 1) : Math.max(1, last));
  const log: PainLog = {
    id: newId(),
    date: todayIso,
    weekId: getWeekId(new Date(`${todayIso}T12:00:00`)),
    bodyPart: issue.bodyPart,
    severity,
    issueId: issue.id,
    trend,
    ...(extra.notes ? { notes: extra.notes } : {}),
    ...(extra.kinds?.length ? { kinds: extra.kinds } : {}),
    ...(extra.timing?.length ? { timing: extra.timing } : {}),
  };
  const next: PainIssue = trend === "gone" ? { ...issue, endDate: todayIso } : issue;
  if (trend === "gone") delete next.endEstimated;
  return { log, issue: next };
}

// --- Labels ---------------------------------------------------------------

export const REGION_LABELS: Record<PainRegion, string> = {
  finger: "Finger", hand: "Hand", wrist: "Wrist", forearm: "Forearm", elbow: "Elbow", shoulder: "Shoulder",
  neck: "Neck", back: "Back", hip: "Hip", knee: "Knee", ankle: "Ankle", foot: "Foot", other: "Other",
};
export const SIDE_LABELS: Record<PainSide, string> = { left: "Left", right: "Right", both: "Both" };

/** "Left finger - ring A2", "Lower back", "Both shoulders". */
export function bodyPartLabel(region: PainRegion | undefined, side: PainSide | undefined, detail: string | undefined): string {
  const d = detail?.trim();
  if (!region || region === "other") return d || "Pain";
  const base = REGION_LABELS[region];
  const sided = side === "both" ? `Both ${base.toLowerCase()}s` : side ? `${SIDE_LABELS[side]} ${base.toLowerCase()}` : base;
  return d ? `${sided} - ${d}` : sided;
}

/** Regions whose issues start out watching the finger-load categories. */
const FINGER_REGIONS: PainRegion[] = ["finger", "hand", "wrist", "forearm"];

/** The categories a new issue watches by default: the finger-load set for the hand and forearm, nothing otherwise. */
export function defaultWatchCategories(region: PainRegion | undefined, fingerCategoryNames: string[]): string[] {
  return region && FINGER_REGIONS.includes(region) ? [...fingerCategoryNames] : [];
}

// --- Effects ---------------------------------------------------------------

/**
 * The active issues a session touches: those watching a category one of
 * its exercises is charted under (the slot's own category, else its
 * type's).
 */
export function issuesTouchedBy(
  workout: Pick<Workout, "exercises">,
  issues: PainIssue[],
  exerciseTypes: ExerciseTypeDef[],
  categories: AnalyticsCategory[] = [],
): PainIssue[] {
  const watching = issues.filter((i) => isActive(i) && i.watchCategories?.length);
  if (!watching.length) return [];
  const byId = new Map(categories.map((c) => [c.id, c.name]));
  const names = new Set(
    (workout.exercises ?? []).map((s) => (s.categoryId ? byId.get(s.categoryId) : undefined) ?? exerciseTypes.find((t) => t.id === s.typeId)?.category).filter(Boolean) as string[],
  );
  return watching.filter((i) => i.watchCategories!.some((c) => names.has(c)));
}

export const KIND_LABELS: Record<PainKind, string> = { sharp: "Sharp", ache: "Ache", stiff: "Stiff", swelling: "Swelling", tingling: "Tingling" };
export const TIMING_LABELS: Record<PainTiming, string> = { during: "While climbing", after: "After", morning: "Next morning", rest: "At rest" };
export const TREND_LABELS: Record<PainTrend, string> = { gone: "Gone", better: "Better", same: "Same", worse: "Worse" };
export const TREND_ICONS: Record<PainTrend, string> = {
  gone: "ic:baseline-check-circle",
  better: "ic:baseline-trending-down",
  same: "ic:baseline-trending-flat",
  worse: "ic:baseline-trending-up",
};
export const STATUS_LABELS: Record<IssueStatus, string> = { resolved: "Resolved", worse: "Getting worse", improving: "Improving", steady: "Steady", new: "New" };

/**
 * How much pain is open on `dayIso`, for readiness: the worst issue open
 * that day (started, and not yet ended - its last day counts as gone),
 * at its latest check-in on or before the day. Undefined with nothing
 * open or nothing checked in yet.
 */
export function painLevelOn(issues: PainIssue[], logs: PainLog[], dayIso: string): { level: number; label: string } | undefined {
  let worst: { level: number; label: string } | undefined;
  for (const issue of issues) {
    if (issue.startDate > dayIso || (issue.endDate && issue.endDate <= dayIso)) continue;
    const latest = checkInsFor(issue.id, logs).filter((l) => l.date.slice(0, 10) <= dayIso).pop();
    if (!latest) continue;
    if (!worst || latest.severity > worst.level) worst = { level: latest.severity, label: issue.bodyPart };
  }
  return worst;
}

/** An issue's name inside a sentence: "your left finger - ring A2" (only the first letter lowered, so "A2" survives). */
export function inSentence(bodyPart: string): string {
  return bodyPart.length > 1 && bodyPart[1] === bodyPart[1].toLowerCase() ? bodyPart[0].toLowerCase() + bodyPart.slice(1) : bodyPart;
}

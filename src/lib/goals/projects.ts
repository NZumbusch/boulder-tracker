import type { GoalEvent, OutdoorAscent, TripProject } from "../types";
import { coversDate } from "./goals";
import { matchNames, normalizeGrade } from "../sends/matching";
import { parseFontGrade } from "../analytics/grades";

/** Sends logged on any of the goal's days, newest first. */
export function sendsDuring(goal: GoalEvent, ascents: OutdoorAscent[]): OutdoorAscent[] {
  return ascents.filter((a) => a.date && coversDate(goal, a.date)).sort((a, b) => b.date.localeCompare(a.date));
}

export type ProjectState = "done" | "maybe" | "open";

export interface ProjectStatus {
  project: TripProject;
  state: ProjectState;
  /** The send that ticked it. */
  send?: OutdoorAscent;
  /** Fuzzy-matching sends awaiting a yes/no (only when not done). */
  candidates: OutdoorAscent[];
}

const FLASH_STYLES = ["flash", "onsight"];

/** At least as hard as `target` - by Font rank where both parse, else only an exact grade match. */
function meetsGrade(grade: string, target: string): boolean {
  const a = parseFontGrade(grade);
  const b = parseFontGrade(target);
  if (a !== undefined && b !== undefined) return a >= b;
  return normalizeGrade(grade) === normalizeGrade(target);
}

/**
 * Where a project stands given the trip's sends. A named project is done by
 * a send the user confirmed, or one whose name matches after normalising
 * (grade ignored - the same problem gets graded differently); a similar
 * name is a candidate to ask about unless already rejected. A grade-only
 * target is done by any send at or above that grade (flashed, if required).
 */
export function projectStatus(project: TripProject, tripSends: OutdoorAscent[]): ProjectStatus {
  if (!project.name) {
    const send = project.grade
      ? tripSends.find((s) => meetsGrade(s.grade, project.grade!) && (!project.flash || FLASH_STYLES.includes((s.style ?? "").toLowerCase())))
      : undefined;
    return { project, state: send ? "done" : "open", send, candidates: [] };
  }
  const confirmed = tripSends.find((s) => project.confirmedSendIds?.includes(s.id));
  if (confirmed) return { project, state: "done", send: confirmed, candidates: [] };
  const sure = tripSends.find((s) => matchNames(s.name, project.name) === "same");
  if (sure) return { project, state: "done", send: sure, candidates: [] };
  const candidates = tripSends.filter(
    (s) => matchNames(s.name, project.name) === "similar" && !project.rejectedSendIds?.includes(s.id),
  );
  return { project, state: candidates.length > 0 ? "maybe" : "open", candidates };
}

/** `project` with `sendId` confirmed (`counts`) or rejected as matching it. */
export function resolveCandidate(project: TripProject, sendId: string, counts: boolean): TripProject {
  const key = counts ? "confirmedSendIds" : "rejectedSendIds";
  return { ...project, [key]: [...new Set([...(project[key] ?? []), sendId])] };
}

export interface TripSummary {
  sends: OutdoorAscent[];
  hardest?: OutdoorAscent;
  projects: ProjectStatus[];
  projectsDone: number;
}

export function tripSummary(goal: GoalEvent, ascents: OutdoorAscent[]): TripSummary {
  const sends = sendsDuring(goal, ascents);
  let hardest: OutdoorAscent | undefined;
  for (const s of sends) {
    const rank = parseFontGrade(s.grade);
    if (rank !== undefined && (hardest === undefined || rank > (parseFontGrade(hardest.grade) ?? -Infinity))) hardest = s;
  }
  const projects = (goal.projects ?? []).map((p) => projectStatus(p, sends));
  return { sends, hardest, projects, projectsDone: projects.filter((p) => p.state === "done").length };
}

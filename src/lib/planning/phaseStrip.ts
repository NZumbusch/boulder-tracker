import type { PhaseDef, TrainingBlock } from "../types";
import { dayIndexToIso } from "../analytics/recoverySeries";
import { phaseOnDay } from "./trainingBlocks";

/** What the calendar draws for a day's phase. `key` tells whether two days are the same phase. */
export interface PhaseMark {
  key: string;
  name: string;
  /** A Tailwind background class. */
  color?: string;
}

/** The phase on each of `days` (day indexes): its name and colour. Days no block has are left out. */
export function phaseMarks(blocks: TrainingBlock[], phases: PhaseDef[], days: number[]): Map<number, PhaseMark> {
  const marks = new Map<number, PhaseMark>();
  for (const day of days) {
    const block = phaseOnDay(blocks, dayIndexToIso(day));
    if (!block) continue;
    const phase = phases.find((p) => p.id === block.phaseId);
    marks.set(day, { key: `${block.phaseId}|${block.color ?? ""}`, name: phase?.name ?? block.name, color: block.color ?? phase?.color });
  }
  return marks;
}

export interface StripRun {
  mark?: PhaseMark;
  /** The first day of the run (a day index) and how many days it has. */
  from: number;
  count: number;
}

/** `days` cut into runs of consecutive days with the same phase; days with none are runs of their own. */
export function stripRuns(days: number[], marks: Map<number, PhaseMark>): StripRun[] {
  const runs: StripRun[] = [];
  for (const day of days) {
    const mark = marks.get(day);
    const last = runs[runs.length - 1];
    if (last && last.mark?.key === mark?.key) last.count++;
    else runs.push({ mark, from: day, count: 1 });
  }
  return runs;
}

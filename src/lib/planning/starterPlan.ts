import type { PhaseDef, TrainingBlock, WorkoutTemplate } from "../types";
import { getWeekId, getWeekIdRange, incrementWeekId, weekMondayIso, weekSundayIso } from "../dateUtils";
import { blockWeekIds } from "./trainingBlocks";

/**
 * The plan the welcome offers a new user, so Plan and Home show real
 * sessions from minute one instead of "No Phase". Blocks only - the
 * sessions themselves are projected from the phase's templates (copy-on-
 * write weeks, weekProjection.ts), so accepting writes a few block rows and
 * undoing deletes them.
 */

export interface StarterPlanOption {
  id: "base-4" | "base-deload";
  name: string;
  description: string;
  /** Blocks to save (ids are minted by the caller). */
  blocks: Omit<TrainingBlock, "id">[];
}

/**
 * The week the plan starts in: this week, unless it's nearly over (Friday
 * on) - then a plan "starting now" would show one or two days.
 */
export function firstPlanWeek(today: Date): string {
  const thisWeek = getWeekId(today);
  const weekday = (today.getDay() + 6) % 7; // Monday = 0
  return weekday >= 4 ? incrementWeekId(thisWeek) : thisWeek;
}

/** `weeks` consecutive week ids from `start`. */
function weeksFrom(start: string, weeks: number): string[] {
  let end = start;
  for (let i = 1; i < weeks; i++) end = incrementWeekId(end);
  return getWeekIdRange(start, end);
}

/** The days of the whole weeks `first` to `last`. */
const weeks = (first: string, last: string) => ({ startDate: weekMondayIso(first), endDate: weekSundayIso(last) });

export function starterPlanOptions(startWeekId: string): StarterPlanOption[] {
  const four = weeksFrom(startWeekId, 4);
  const three = four.slice(0, 3);
  return [
    {
      id: "base-4",
      name: "4 weeks of base",
      description: "Volume climbing and easy mileage, the same each week. The simplest way to start.",
      blocks: [{ name: "Capacity", phaseId: "phase-capacity", ...weeks(four[0], four[3]) }],
    },
    {
      id: "base-deload",
      name: "3 weeks of base, then an easy week",
      description: "Three building weeks and a lighter one to absorb them: how blocks usually run.",
      blocks: [
        { name: "Capacity", phaseId: "phase-capacity", ...weeks(three[0], three[2]) },
        { name: "Deload", phaseId: "phase-deload", ...weeks(four[3], four[3]) },
      ],
    },
  ];
}

export interface StarterPreviewLine {
  phase: string;
  weeks: number;
  /** The names of the sessions each of those weeks holds. */
  sessions: string[];
}

/** What choosing `option` gives, in words, for the level whose templates are `templates`. */
export function previewOf(option: StarterPlanOption, templates: Record<string, WorkoutTemplate[]>, phases: PhaseDef[]): StarterPreviewLine[] {
  return option.blocks.map((b) => ({
    phase: phases.find((p) => p.id === b.phaseId)?.name ?? b.name,
    weeks: blockWeekIds(b).length,
    sessions: (templates[b.phaseId] ?? []).map((t) => t.name || "Session"),
  }));
}

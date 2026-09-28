/**
 * Older AI replies (the "weekly" and "phase" plan formats, before change
 * sets) converted into a change set, so they go through the same planner
 * and preview. Nothing is dropped: exercise names that aren't in the list
 * become "add" entries, each phase's sessions become its typical week
 * (edit if the phase exists, add if not), and weeks keep their phase,
 * sessions and notes.
 */
import type { ExerciseTypeDef, PhaseDef } from "../types";
import type { AIPlanOutput, AIPlanWorkout } from "./schema";
import type { AIChangeSet, CSExerciseTypeChange, CSSession, CSWeekChange, CSPhaseChange } from "./changeSet";
import { findExerciseTypeByName, findPhaseByName, normalizeName } from "./planImport";

function toSession(w: AIPlanWorkout): CSSession {
  return {
    name: w.name?.trim() || "Session",
    dayOfWeek: w.dayOfWeek,
    startTime: w.startTime,
    plannedDuration: w.plannedDuration,
    exercises: w.exercises,
  };
}

export function legacyPlanToChangeSet(plan: AIPlanOutput, current: { exerciseTypes: ExerciseTypeDef[]; phaseDefs: PhaseDef[] }): AIChangeSet {
  // Exercise types the plan uses but the list doesn't have.
  const exerciseTypes: CSExerciseTypeChange[] = [];
  const seen = new Set<string>();
  for (const week of plan.weeks) {
    for (const workout of week.workouts) {
      for (const e of workout.exercises) {
        const key = normalizeName(e.exerciseTypeName);
        if (seen.has(key) || findExerciseTypeByName(e.exerciseTypeName, current.exerciseTypes)) continue;
        seen.add(key);
        exerciseTypes.push({ action: "add", name: e.exerciseTypeName, categoryName: e.categoryName });
      }
    }
  }

  const phases: CSPhaseChange[] = [];
  const weeks: CSWeekChange[] = [];
  const phaseAction = (name: string, sessions: CSSession[]): CSPhaseChange =>
    findPhaseByName(name, current.phaseDefs) ? { action: "edit", name, sessions } : { action: "add", name, sessions };

  if (plan.format === "phase" && plan.phases) {
    for (const phase of plan.phases) {
      phases.push(phaseAction(phase.phaseName, phase.sessions.map(toSession)));
      const range = plan.weeks.filter((w) => w.weekId >= phase.startWeekId && w.weekId <= phase.endWeekId).map((w) => w.weekId);
      weeks.push({ weekIds: range, phase: phase.phaseName, ...(phase.notes ? { blockNotes: phase.notes } : {}) });
      for (const [weekId, note] of Object.entries(phase.weekNotes ?? {})) weeks.push({ weekIds: [weekId], notes: note });
    }
  } else {
    // Weekly: phases the app doesn't know yet are created (with no typical
    // week - every week here is spelled out anyway).
    const added = new Set<string>();
    for (const week of plan.weeks) {
      const key = normalizeName(week.phaseName);
      if (!findPhaseByName(week.phaseName, current.phaseDefs) && !added.has(key)) {
        added.add(key);
        phases.push({ action: "add", name: week.phaseName, sessions: [] });
      }
      weeks.push({ weekIds: [week.weekId], phase: week.phaseName, sessions: week.workouts.map(toSession), ...(week.notes ? { notes: week.notes } : {}) });
    }
  }
  return { exerciseTypes, phases, weeks: weeks.filter((w) => w.weekIds.length > 0), planB: [], coachNotes: [], circuits: [] };
}

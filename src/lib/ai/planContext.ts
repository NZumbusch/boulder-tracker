/**
 * The current plan, as the AI needs to see it to edit it - and no more.
 *
 * Every phase's typical week is included in full: phase edits change it
 * and every week following the phase inherits it. For the target weeks, a
 * week that still follows its phase is one line ("phase X, no changes");
 * only a week with its own stored sessions is spelled out. Sessions use the
 * exact shape the change-set contract takes (name, dayOfWeek, notes,
 * exercises[{exerciseTypeName, values}]) so the AI can copy what it sees
 * into an edit. One compact JSON object per line keeps the prompt short.
 */
import type { Circuit, DayOfWeek, ExerciseGroup, ExerciseSlot, ExerciseTypeDef, PhaseDef, PlanAlternative, TrainingBlock, WeekNote, WeekOverride, Workout, WorkoutTemplate } from "../types";
import { allOccurrenceKeys, describeChanges, occurrenceFirstDay, weekAndDayOf } from "../planning/planB";
import { getDominantBlockForWeek } from "../planning/trainingBlocks";
import { sortWorkoutsBySchedule } from "../planning/sortWorkouts";
import { weekNoteText } from "../planning/notes";
import { weekDatesText } from "../dateUtils";
import { slotValues } from "../exerciseSlot";
import { workoutItems } from "../exercise/groups";

export interface PlanContextInput {
  exerciseTypes: ExerciseTypeDef[];
  phaseDefs: PhaseDef[];
  templates: Record<string, WorkoutTemplate[]>;
  trainingBlocks: TrainingBlock[];
  workouts: Workout[];
  weekOverrides: WeekOverride[];
  weekNotes: WeekNote[];
  /** Existing Plan Bs - the ones touching the target weeks are listed. */
  planAlternatives?: PlanAlternative[];
  targetWeekIds: string[];
  /** Days the athlete marked as uncertain in every target week - the AI is asked to give them a Plan B. */
  uncertainDays?: DayOfWeek[];
  /** The saved-circuit library, listed so sessions can use a circuit by name. */
  circuits?: Circuit[];
}

type Session = {
  name?: string;
  dayOfWeek?: string;
  startTime?: string;
  plannedDuration?: number;
  notes?: string;
  exercises: (Exercise | { circuit: Record<string, unknown>; exercises: Exercise[] })[];
};
type Exercise = { exerciseTypeName: string; values?: Record<string, unknown> };

/** Drops undefined/empty fields so the line stays short. */
function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))) as T;
}

function exerciseOf(s: ExerciseSlot, types: ExerciseTypeDef[]): Exercise {
  const values = compact({ ...(s.prescribed ?? slotValues(s)) } as Record<string, unknown>);
  return compact({ exerciseTypeName: types.find((t) => t.id === s.typeId)?.name ?? "Unknown", values: Object.keys(values).length ? values : undefined }) as Exercise;
}

/** A session's exercises in the change-set shape - a circuit spelled out the way an edit would give it. */
function exercisesOf(w: { exercises: ExerciseSlot[]; groups?: ExerciseGroup[] }, types: ExerciseTypeDef[]): Session["exercises"] {
  return workoutItems(w).map((item) =>
    item.kind === "slot"
      ? exerciseOf(item.slot, types)
      : {
          circuit: compact({ name: item.group.name, rounds: item.group.rounds, transition: item.group.transition, roundRest: item.group.roundRest }),
          exercises: item.members.map((m) => exerciseOf(m.slot, types)),
        },
  );
}

function templateSession(t: WorkoutTemplate, types: ExerciseTypeDef[]): Session {
  return compact({ name: t.name, dayOfWeek: t.dayOfWeek, startTime: t.startTime, plannedDuration: t.plannedDuration, notes: t.description, exercises: exercisesOf({ exercises: t.exercises ?? [], groups: t.groups }, types) }) as Session;
}

function workoutSession(w: Workout, types: ExerciseTypeDef[]): Session {
  return compact({ name: w.notes, dayOfWeek: w.dayOfWeek, startTime: w.startTime, plannedDuration: w.plannedDuration, notes: w.description, exercises: exercisesOf(w, types) }) as Session;
}

export function buildPlanContext(input: PlanContextInput): string {
  const { exerciseTypes: types, phaseDefs, templates, trainingBlocks, workouts, weekOverrides, weekNotes, targetWeekIds } = input;
  const lines: string[] = [];

  if (input.circuits?.length) {
    lines.push('SAVED CIRCUITS - use one in a session as { "circuit": "<name>" } (add "rounds"/"transition"/"roundRest" to re-time it):');
    for (const c of input.circuits) {
      lines.push(JSON.stringify(compact({
        name: c.name, description: c.description, rounds: c.rounds, transition: c.transition, roundRest: c.roundRest,
        exercises: c.exercises.map((s) => exerciseOf(s, types)),
      })));
    }
    lines.push("");
  }

  lines.push("PHASES - each phase's typical week (what every week following that phase gets):");
  for (const phase of phaseDefs.filter((p) => !p.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const week = (templates[phase.id] ?? []).map((t) => templateSession(t, types));
    lines.push(JSON.stringify({ phase: phase.name, typicalWeek: week }));
  }

  const inRange = trainingBlocks
    .filter((b) => targetWeekIds.length && b.startWeekId <= targetWeekIds[targetWeekIds.length - 1] && b.endWeekId >= targetWeekIds[0])
    .sort((a, b) => a.startWeekId.localeCompare(b.startWeekId));
  if (inRange.length) {
    lines.push("", "BLOCKS overlapping the target weeks:");
    for (const b of inRange) {
      lines.push(JSON.stringify(compact({ block: b.name, phase: phaseDefs.find((p) => p.id === b.phaseId)?.name, from: b.startWeekId, to: b.endWeekId, dates: weekDatesText(b.startWeekId, b.endWeekId), notes: b.notes })));
    }
  }

  lines.push("", "TARGET WEEKS - current state:");
  for (const weekId of targetWeekIds) {
    const phase = phaseDefs.find((p) => p.id === getDominantBlockForWeek(trainingBlocks, weekId)?.phaseId)?.name;
    const stored = workouts.filter((w) => w.weekId === weekId);
    const planned = sortWorkoutsBySchedule(stored.filter((w) => w.status === "planned"));
    const completed = stored.filter((w) => w.status === "completed");
    const note = weekNoteText(weekNotes, weekId) || undefined;
    if (stored.length === 0) {
      lines.push(JSON.stringify(compact({ week: weekId, dates: weekDatesText(weekId), phase: phase ?? "none", state: phase ? "follows its phase - no changes" : "empty", note })));
      continue;
    }
    lines.push(JSON.stringify(compact({
      week: weekId,
      dates: weekDatesText(weekId),
      phase: phase ?? "none",
      state: weekOverrides.find((o) => o.weekId === weekId)?.customized ? "custom (edited by hand)" : "stored (as generated from its phase)",
      sessions: planned.map((w) => workoutSession(w, types)),
      completed: completed.map((w) => `${w.dayOfWeek ?? w.date?.slice(0, 10) ?? ""} ${w.notes ?? "Session"}`.trim()),
      note,
    })));
  }
  const first = targetWeekIds[0];
  const last = targetWeekIds[targetWeekIds.length - 1];
  const planBs = (input.planAlternatives ?? []).filter((alt) => {
    if (!first) return false;
    const keys = allOccurrenceKeys(alt);
    const end = weekAndDayOf(occurrenceFirstDay(alt, keys[keys.length - 1]) + alt.days - 1).weekId;
    return keys[0] <= last && end >= first;
  });
  if (planBs.length) {
    lines.push("", "PLAN B - uncertain stretches already planned (each is what Plan B does differently from Plan A; delete one by its start day):");
    for (const alt of planBs) {
      const firstDay = occurrenceFirstDay(alt, alt.startWeekId);
      const end = weekAndDayOf(firstDay + alt.days - 1);
      lines.push(JSON.stringify(compact({
        label: alt.label,
        start: { week: alt.startWeekId, day: alt.startDay },
        end: alt.days > 1 ? { week: end.weekId, day: end.day } : undefined,
        repeatUntil: alt.repeatUntilWeekId,
        outdoor: alt.outdoor,
        likely: alt.likely,
        planB: describeChanges(alt),
        decided: Object.entries(alt.occurrences ?? {}).filter(([, o]) => o.chosen).map(([week, o]) => `${week}: Plan ${o.chosen}`),
      })));
    }
  }
  if (input.uncertainDays?.length) {
    lines.push("", `UNCERTAIN DAYS: ${input.uncertainDays.join(", ")} in every target week may go either way (outdoor or not, depending on weather and plans). Give them a Plan B ("planB" section) - repeating weekly where the same Plan B fits - and plan the rest of each week so either version works.`);
  }
  return lines.join("\n");
}

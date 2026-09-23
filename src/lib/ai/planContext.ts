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
import type { ExerciseSlot, ExerciseTypeDef, PhaseDef, TrainingBlock, WeekNote, WeekOverride, Workout, WorkoutTemplate } from "../types";
import { getDominantBlockForWeek } from "../planning/trainingBlocks";
import { sortWorkoutsBySchedule } from "../planning/sortWorkouts";
import { weekNoteText } from "../planning/notes";
import { slotValues } from "../exerciseSlot";

export interface PlanContextInput {
  exerciseTypes: ExerciseTypeDef[];
  phaseDefs: PhaseDef[];
  templates: Record<string, WorkoutTemplate[]>;
  trainingBlocks: TrainingBlock[];
  workouts: Workout[];
  weekOverrides: WeekOverride[];
  weekNotes: WeekNote[];
  targetWeekIds: string[];
}

type Session = {
  name?: string;
  dayOfWeek?: string;
  startTime?: string;
  plannedDuration?: number;
  notes?: string;
  exercises: { exerciseTypeName: string; values?: Record<string, unknown> }[];
};

/** Drops undefined/empty fields so the line stays short. */
function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))) as T;
}

function exercisesOf(slots: ExerciseSlot[], types: ExerciseTypeDef[]): Session["exercises"] {
  return slots.map((s) => {
    const values = compact({ ...(s.prescribed ?? slotValues(s)) } as Record<string, unknown>);
    return compact({ exerciseTypeName: types.find((t) => t.id === s.typeId)?.name ?? "Unknown", values: Object.keys(values).length ? values : undefined }) as Session["exercises"][number];
  });
}

function templateSession(t: WorkoutTemplate, types: ExerciseTypeDef[]): Session {
  return compact({ name: t.name, dayOfWeek: t.dayOfWeek, startTime: t.startTime, plannedDuration: t.plannedDuration, notes: t.description, exercises: exercisesOf(t.exercises ?? [], types) }) as Session;
}

function workoutSession(w: Workout, types: ExerciseTypeDef[]): Session {
  return compact({ name: w.notes, dayOfWeek: w.dayOfWeek, startTime: w.startTime, plannedDuration: w.plannedDuration, notes: w.description, exercises: exercisesOf(w.exercises, types) }) as Session;
}

export function buildPlanContext(input: PlanContextInput): string {
  const { exerciseTypes: types, phaseDefs, templates, trainingBlocks, workouts, weekOverrides, weekNotes, targetWeekIds } = input;
  const lines: string[] = [];

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
      lines.push(JSON.stringify(compact({ block: b.name, phase: phaseDefs.find((p) => p.id === b.phaseId)?.name, from: b.startWeekId, to: b.endWeekId, notes: b.notes })));
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
      lines.push(JSON.stringify(compact({ week: weekId, phase: phase ?? "none", state: phase ? "follows its phase - no changes" : "empty", note })));
      continue;
    }
    lines.push(JSON.stringify(compact({
      week: weekId,
      phase: phase ?? "none",
      state: weekOverrides.find((o) => o.weekId === weekId)?.customized ? "custom (edited by hand)" : "stored (as generated from its phase)",
      sessions: planned.map((w) => workoutSession(w, types)),
      completed: completed.map((w) => `${w.dayOfWeek ?? w.date?.slice(0, 10) ?? ""} ${w.notes ?? "Session"}`.trim()),
      note,
    })));
  }
  return lines.join("\n");
}

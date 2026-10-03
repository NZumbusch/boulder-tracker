import type { AnalyticsCategory, ExerciseSlot, ExerciseTypeDef, ValueDef, Workout } from "../types";
import { AI_VALUES_CONTRACT } from "./schema";
import { customValuesReference } from "./valueSpec";
import { buildAnalyticsCategorySummaries, buildExerciseModalities, type WorkoutNoteSharing } from "./context";

/**
 * The prompt behind the workout editor's "Fill with AI" - one session, not
 * the plan. Like the plan prompt it shows the AI the exercise list (so it
 * reuses the user's names instead of inventing near-duplicates that would each
 * become a new exercise type) and the thing being edited. The reply shape
 * is the workout-log contract (`validateAIWorkoutLogOutput`), asked for as
 * exactly one workout.
 *
 * `mode` must match what the import does with the reply: "add" appends the
 * returned exercises, "replace" swaps the session's list for them - so the
 * AI is told to return only new ones, or the complete list.
 */
export interface SessionPromptInput {
  workout: Workout;
  /** The user's own words: what to build, or what they did. */
  request: string;
  mode: "add" | "replace";
  exerciseTypes: ExerciseTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  /** The athlete's own value types, if any. */
  valueDefs?: ValueDef[];
  /** What the "AI Sharing" switches allow of a finished session's notes; absent means the defaults. */
  noteSharing?: WorkoutNoteSharing;
}

function currentExercises(slots: ExerciseSlot[], bucket: "prescribed" | "logged", types: ExerciseTypeDef[]): string {
  return slots
    .map((s) => {
      const values = Object.fromEntries(Object.entries(s[bucket] ?? {}).filter(([, v]) => v !== undefined && v !== ""));
      const name = types.find((t) => t.id === s.typeId)?.name ?? "Unknown";
      return JSON.stringify(Object.keys(values).length ? { exerciseTypeName: name, values } : { exerciseTypeName: name });
    })
    .join("\n");
}

export function buildSessionPrompt(input: SessionPromptInput): string {
  const { workout, request, mode, exerciseTypes, analyticsCategories, noteSharing = { logNotes: true, planNotes: false }, valueDefs = [] } = input;
  const isLog = workout.status === "completed";
  const bucket = isLog ? "logged" : "prescribed";
  const existing = workout.exercises.length > 0 ? currentExercises(workout.exercises, bucket, exerciseTypes) : "";

  const task = isLog
    ? "You are turning my notes about a climbing/training session into a structured log of what I actually did."
    : "You are helping me plan one climbing/training session as structured exercises.";

  const whatToReturn = !existing
    ? "Return the exercises for this session."
    : mode === "add"
      ? "Return ONLY the exercises to ADD to this session. The ones already in it stay as they are - do not repeat them."
      : "Return the COMPLETE exercise list for this session, in order. It replaces the current list entirely, so include any current exercise you want to keep (copy it, adjusting values if needed).";

  const session = [
    `Name: ${workout.notes || "(unnamed)"}`,
    // A finished session's plan note is stale intent - left out unless sharing it is on.
    workout.description && (!isLog || noteSharing.planNotes) ? `Notes: ${workout.description}` : "",
    isLog && noteSharing.logNotes && workout.logNotes?.trim() ? `How it went: ${workout.logNotes.trim()}` : "",
    workout.dayOfWeek ? `Day: ${workout.dayOfWeek}` : "",
    workout.plannedDuration ? `Planned length: ${workout.plannedDuration} min` : "",
    existing ? `Current exercises (${isLog ? "logged" : "planned"} values):\n${existing}` : "Current exercises: none yet",
  ].filter(Boolean).join("\n");

  return `${task}

Respond with ONLY one JSON object - no markdown fences, no text before or after it - in exactly this shape, with exactly ONE workout:

{
  "workouts": [
    {
      "exercises": [
        { "exerciseTypeName": "Hangboard", "values": { "sets": 5, "reps": 6, "timeOn": 10, "timeOff": 180, "notes": "optional" } }
      ]
    }
  ]
}

${whatToReturn}

CIRCUITS AND SUPERSETS (optional): exercises done in rounds go next to each other in "exercises", and the workout gets
  "circuits": [ { "name": "Core A", "rounds": 3, "transition": 15, "roundRest": 60, "exercises": [2, 3, 4] } ]
  where "exercises" are the 1-based positions of its exercises in this reply (consecutive). A round is one set of each, "transition" seconds apart, "roundRest" seconds after each round. Inside a circuit each exercise's "values" describe ONE SET (a time "timeOn" in seconds, or "reps"); its own rest between sets is ignored. Use a superset to fill a long rest (e.g. antagonist work between weighted pull-up sets, rounds = the pull-up sets).

EXERCISE NAMES - use one of my existing exercises whenever it fits, spelled exactly as listed. Only invent a new name when nothing here fits; then also give "categoryName", chosen from the categories below.
My exercises (name, category, tracked fields):
${buildExerciseModalities(exerciseTypes).map((m) => JSON.stringify(m)).join("\n")}
Categories: ${buildAnalyticsCategorySummaries(analyticsCategories).map((c) => c.name).join(", ")}

${AI_VALUES_CONTRACT}
${customValuesReference(valueDefs) ? `\n${customValuesReference(valueDefs)}\n` : ""}
THE SESSION
${session}

${isLog ? "What I actually did" : "What I want"}:
${request.trim() || "(see the session above)"}
`;
}

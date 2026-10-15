import type { AnalyticsCategory, ExerciseSlot, ExerciseTypeDef, Workout } from "../types";
import { DEFAULT_EXERCISE_MINUTES, estimateSlotDuration } from "./sessionDuration";
import { groupMemberMinutes } from "../exercise/groups";
import { slotTypeName } from "../exerciseSlot";

/*
 * What a session is made of, for the calendar: each exercise as a segment of
 * the session as long as it takes, in the colour of its analytics category,
 * and the session's own colour - the category that takes most of it.
 */

export interface ExerciseSegment {
  slotId: string;
  name: string;
  minutes: number;
  /** The category's Tailwind background class; undefined when the exercise has no known category. */
  color?: string;
}

function categoryOf(slot: ExerciseSlot, types: ExerciseTypeDef[], categories: AnalyticsCategory[]): AnalyticsCategory | undefined {
  const ref = (slot as { categoryId?: string }).categoryId ?? types.find((t) => t.id === slot.typeId)?.category;
  return categories.find((c) => c.id === ref || c.name === ref);
}

/** The exercises of a session, in order, each with its length and colour. Skipped ones are left out. */
export function exerciseSegments(workout: Workout, types: ExerciseTypeDef[], categories: AnalyticsCategory[]): ExerciseSegment[] {
  const inGroup = groupMemberMinutes(workout, workout.status === "completed" ? "actual" : "planned");
  return workout.exercises
    .filter((slot) => !slot.skipped)
    .map((slot) => ({
      slotId: slot.id,
      name: slotTypeName(slot, types),
      minutes: inGroup.get(slot.id) ?? estimateSlotDuration(slot) ?? DEFAULT_EXERCISE_MINUTES,
      color: categoryOf(slot, types, categories)?.color,
    }));
}

/** The colour of the category that takes most of the session; undefined when none of its exercises has a known category. */
export function sessionColor(workout: Workout, types: ExerciseTypeDef[], categories: AnalyticsCategory[]): string | undefined {
  const minutes = new Map<string, number>();
  for (const seg of exerciseSegments(workout, types, categories)) if (seg.color) minutes.set(seg.color, (minutes.get(seg.color) ?? 0) + seg.minutes);
  let best: string | undefined;
  for (const [color, m] of minutes) if (best === undefined || m > (minutes.get(best) ?? 0)) best = color;
  return best;
}

/** The one colour sessions share on the calendar (Tailwind class); `SESSION_HEX` in `calendar/eventColor.ts` is the same colour. */
export const SESSION_CLASS = "bg-emerald-500";

/**
 * A session's fill on the calendar: the shared session colour, or - with `byCategory` - the category that takes
 * most of it (the shared colour still when it has none).
 */
export function calendarSessionColor(workout: Workout, types: ExerciseTypeDef[], categories: AnalyticsCategory[], byCategory: boolean): string {
  return (byCategory ? sessionColor(workout, types, categories) : undefined) ?? SESSION_CLASS;
}

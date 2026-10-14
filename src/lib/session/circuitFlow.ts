import type { ExerciseSlot } from "../types";
import { slotStatus } from "./activeSession";

/**
 * How a live session treats the circuits among its exercises: which members are still to do (a circuit run covers
 * those and only those - a skipped or logged member would run again otherwise), and what skipping one of them means.
 */

/** The members of a circuit that still need doing, in order. */
export function pendingMembers(exercises: readonly ExerciseSlot[], groupId: string): ExerciseSlot[] {
  return exercises.filter((s) => s.groupId === groupId && slotStatus(s) === "pending");
}

export type SkipPlan =
  /** Nothing to ask: not in a circuit, or the last member still to do - skipping it is skipping the circuit. */
  | { kind: "direct" }
  /** Ask: just this exercise, or the whole circuit (`others` are the members that would go too). */
  | { kind: "ask"; groupId: string; others: ExerciseSlot[] };

export function skipPlan(exercises: readonly ExerciseSlot[], slotId: string): SkipPlan {
  const slot = exercises.find((s) => s.id === slotId);
  if (!slot?.groupId) return { kind: "direct" };
  const others = pendingMembers(exercises, slot.groupId).filter((s) => s.id !== slotId);
  return others.length === 0 ? { kind: "direct" } : { kind: "ask", groupId: slot.groupId, others };
}

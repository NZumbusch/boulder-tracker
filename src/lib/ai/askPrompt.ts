import type { ExerciseTypeDef, Workout } from "../types";
import type { Insight } from "../analytics/insights";
import { summarizeWorkout, type WorkoutNoteSharing } from "./context";

/**
 * Short prompts for a question about one thing - a group of Insights, or a
 * single session - rather than a plan change: the answer is read in the
 * chat, nothing comes back into the app. The coaching memory and the app's
 * own recent-weeks digest go along, so the answer is about this athlete.
 */

export const ASK_PREAMBLE =
  "You are an elite climbing coach. Answer in plain language, using my numbers. Keep it under about 250 words and end with one to three concrete things to do. This is a question, not a plan change: don't reply with JSON.";

export const DEFAULT_INSIGHT_QUESTION = "Is this something to act on? What would you change this week, and why?";
export const DEFAULT_BLOCK_QUESTION = "What did this block do for me? What should the next block carry on, and what should it change?";
export const DEFAULT_SESSION_QUESTION = "How did this session go against the plan? What should I do differently next time?";

const lines = (items: unknown[]) => items.map((i) => JSON.stringify(i)).join("\n");

export function buildInsightAskPrompt(opts: { groupLabel: string; findings: Insight[]; sinceLast: string; coachMemory?: string; question: string }): string {
  const { groupLabel, findings, sinceLast, coachMemory, question } = opts;
  const found = findings.map((f) => `- ${f.title}${f.detail ? ` - ${f.detail}` : ""}`).join("\n");
  return [
    ASK_PREAMBLE,
    coachMemory?.trim() ? `My coaching memory:\n${coachMemory.trim()}` : "",
    `The app (my training tracker) found this about "${groupLabel}", computed from my own data:\n${found || "(nothing)"}`,
    sinceLast.trim() ? sinceLast.trim() : "",
    `My question:\n${question.trim() || DEFAULT_INSIGHT_QUESTION}`,
  ].filter(Boolean).join("\n\n");
}

export function buildSessionAskPrompt(opts: {
  workout: Workout;
  /** The sessions just before it, for comparison. */
  before: Workout[];
  exerciseTypes: ExerciseTypeDef[];
  noteSharing: WorkoutNoteSharing;
  coachMemory?: string;
  question: string;
}): string {
  const { workout, before, exerciseTypes, noteSharing, coachMemory, question } = opts;
  const done = workout.status === "completed";
  return [
    ASK_PREAMBLE,
    coachMemory?.trim() ? `My coaching memory:\n${coachMemory.trim()}` : "",
    `The session${done ? " I did" : " I have planned"} ("exercises" show ${done ? "what I logged; the plan where I logged nothing" : "the plan"}; load is the score from my after-session ratings, ratings are 1-10):\n${JSON.stringify(summarizeWorkout(workout, exerciseTypes, noteSharing))}`,
    before.length ? `My previous sessions, for comparison:\n${lines(before.map((w) => summarizeWorkout(w, exerciseTypes, noteSharing)))}` : "",
    `My question:\n${question.trim() || DEFAULT_SESSION_QUESTION}`,
  ].filter(Boolean).join("\n\n");
}

export function buildBlockAskPrompt(opts: { reviewLines: string[]; sinceLast: string; coachMemory?: string; question: string }): string {
  return [
    ASK_PREAMBLE,
    opts.coachMemory?.trim() ? `My coaching memory:\n${opts.coachMemory.trim()}` : "",
    `A training block I just did (computed by my tracker from my own data):\n${opts.reviewLines.map((l) => `- ${l}`).join("\n")}`,
    opts.sinceLast.trim(),
    `My question:\n${opts.question.trim() || DEFAULT_BLOCK_QUESTION}`,
  ].filter(Boolean).join("\n\n");
}

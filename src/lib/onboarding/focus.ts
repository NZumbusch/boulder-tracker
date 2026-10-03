import type { AthleteProfile } from "../types";

/**
 * The welcome's "what do you climb, and what for?" step. The answers don't
 * change the app's screens (it is built around bouldering, and says so); they
 * go where they do some good: into the AI coach's "About me" and standing
 * goal (Settings → Coach notes), and into the starter plan's default.
 */
export type Discipline = "boulder" | "routes" | "both";
export type StartGoal = "stronger" | "trip" | "log";

const DISCIPLINE_TEXT: Record<Discipline, string> = {
  boulder: "I mainly boulder.",
  routes: "I mainly climb routes (sport and lead).",
  both: "I boulder and climb routes.",
};

const GOAL_TEXT: Record<StartGoal, string> = {
  stronger: "Get stronger and climb harder, building up steadily.",
  trip: "Peak for an outdoor trip or a competition (its dates are in my plan).",
  log: "Keep track of my climbing, with no particular target.",
};

/**
 * The profile with the answers added, or `null` if nothing was answered.
 * What the person already wrote is kept: an existing standing goal stays, and
 * the discipline sentence is appended to "other" rather than replacing it.
 */
export function focusToProfile(discipline: Discipline | null, goal: StartGoal | null, existing: AthleteProfile | undefined): AthleteProfile | null {
  if (!discipline && !goal) return null;
  const profile: AthleteProfile = { id: "me", ...existing };
  if (discipline) {
    const sentence = DISCIPLINE_TEXT[discipline];
    profile.other = profile.other?.trim() ? `${profile.other.trim()} ${sentence}` : sentence;
  }
  if (goal && !profile.standingGoal?.trim()) profile.standingGoal = GOAL_TEXT[goal];
  return profile;
}

/** Someone who only wants to log doesn't need a plan handed to them. */
export function defaultPlanChoice(goal: StartGoal | null): "base-4" | "none" {
  return goal === "log" ? "none" : "base-4";
}

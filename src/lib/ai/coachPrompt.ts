import { buildAIContextProfile, type AIContextProfile, type AIContextSource, type AIPromptMode, type ModelOptions } from "./context";
import { buildPlanContext, type PlanContextInput } from "./planContext";
import type { AISharingPreferences } from "../preferences/migrate";
import type { AIHistoryWindow } from "../preferences/migrate";
import { AI_CHANGESET_INSTRUCTIONS } from "./changeSetPrompt";
import { renderCoachMemory, COACH_MEMORY_READ_ONLY } from "./coachNotes";
import type { AthleteProfile, CoachNote } from "../types";
import type { DayOfWeek } from "../types";

/**
 * The plan-level AI prompts, as text: "generate" (change the plan - the
 * reply comes back as a change set), "analyze" (feedback on a past window,
 * read in the chat) and "context" (just the profile, for your own
 * questions). Pure; the AI Coach modal gathers the inputs and copies it.
 */

/**
 * One JSON object per line, no indentation. The same data as pretty-printed
 * JSON at roughly 60% of the size, and just as readable to a model.
 */
function lines(items: unknown[]): string {
  return items.length ? items.map((i) => JSON.stringify(i)).join("\n") : "(none)";
}

/** Renders every present field of `profile` as a "- Label:" section, joined with blank lines. */
export function renderProfileSections(profile: AIContextProfile, mode: AIPromptMode, history?: AIHistoryWindow): string {
  const sections: string[] = [];
  if (profile.exerciseModalities) {
    sections.push(`- Custom Exercise Modalities (name, analytics category, library group, tracked fields; "noHowTo" = it has no how-to text yet):\n${lines(profile.exerciseModalities)}`);
  }
  if (profile.archivedExercises?.length) {
    sections.push(`- Archived Exercises (names only - to use one again, "add" it with this exact name and it is restored; don't add a near-duplicate): ${profile.archivedExercises.join(", ")}`);
  }
  if (profile.analyticsCategories) {
    sections.push(`- Analytics Categories (pick one for a new exercise's "categoryName" if you invent one - see the rules below): ${profile.analyticsCategories.map((c) => c.name).join(", ")}`);
  }
  // In "generate" the current-plan section already lists phases and blocks in full.
  if (profile.phases && mode !== "generate") {
    sections.push(`- Available Phases: ${profile.phases.join(", ")}.`);
  }
  if (mode === "analyze") {
    sections.push(`- Completed Workouts (Target Timeframe):\n${lines(profile.recentWorkouts)}`);
  } else {
    const weeks = history?.fullWeeks;
    sections.push(`- Completed Sessions${weeks ? ` (last ${weeks} week${weeks === 1 ? "" : "s"}, in full)` : ""}:\n${lines(profile.recentWorkouts)}`);
  }
  if (profile.weeklyHistory?.length) {
    sections.push(`- Weekly History before that (one line per week, oldest first: sessions, total minutes, summed load, logged minutes per category, average post-session ratings 1-10):\n${lines(profile.weeklyHistory)}`);
  }
  sections.push(
    mode === "analyze"
      ? `- Benchmarks Recorded (Target Timeframe):\n${lines(profile.benchmarks)}`
      : `- My Benchmarks:\n${lines(profile.benchmarks)}`,
  );
  if (profile.trainingBlocks && mode !== "generate") {
    sections.push(`- Training Blocks (covering or near the timeframe):\n${lines(profile.trainingBlocks)}`);
  }
  if (profile.goals?.length) {
    sections.push(`- Upcoming Goals (competitions and outdoor trips I'm peaking for; trips list the problems I want to send there):\n${lines(profile.goals)}`);
  }
  if (profile.readiness) {
    sections.push(`- Readiness Snapshot:\n${JSON.stringify(profile.readiness)}`);
  }
  if (profile.painIssues?.length) {
    sections.push(`- Pain Issues (open ones, and any resolved in the last 90 days; severity 0-10; "course" is the check-ins in order; plan around open ones - especially what they're "aggravatedBy"):\n${lines(profile.painIssues)}`);
  }
  if (profile.outdoorAscents?.length) {
    sections.push(`- Recent Outdoor Ascents:\n${lines(profile.outdoorAscents)}`);
  }
  if (profile.weekNotes && profile.weekNotes.length > 0) {
    sections.push(`- My Week Notes (circumstances and ideas I wrote down for specific weeks - take them into account):\n${lines(profile.weekNotes)}`);
  }
  return sections.join("\n\n");
}

/**
 * A rough token count for display ("~14k tokens"). Models split text into
 * tokens differently; ~3.5 characters per token is a fair average for
 * this mix of English and JSON. Only ever shown as an estimate.
 */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 3.5);
}

export function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `~${(tokens / 1000).toFixed(tokens < 10000 ? 1 : 0)}k tokens` : `~${tokens} tokens`;
}

export interface CoachPromptInput {
  mode: AIPromptMode;
  profile: AIContextProfile;
  /** The weeks the AI may change ("generate") or should review ("analyze"). */
  targetWeekIds: string[];
  goal: string;
  /** `buildPlanContext` output - "generate" only. */
  planContext?: string;
  /** The history window the profile was built with, for the section labels. */
  history?: AIHistoryWindow;
  /** About me, standing goal and coach notes (`renderCoachMemory`) - empty when there are none or sharing is off. */
  coachMemory?: string;
}

export function buildCoachPrompt(input: CoachPromptInput): string {
  const { mode, profile, targetWeekIds, goal, planContext, history, coachMemory } = input;
  const profileText = renderProfileSections(profile, mode, history);
  // The coaching memory comes first: it's what every AI coach should know
  // before reading the data. Only a change set can update it.
  const memory = coachMemory?.trim()
    ? `My coaching memory:\n${coachMemory.trim()}\n${mode === "generate" ? 'Use it throughout. You may update the coach notes - see "coachNotes" below.' : COACH_MEMORY_READ_ONLY}\n\n`
    : "";

  if (mode === "context") {
    return `${memory}Here is my condensed training profile (no specific question attached - I'll ask you directly after pasting this):

${profileText}`;
  }

  if (mode === "generate") {
    return `You are an elite climbing coach managing my training plan in an app. Based on my goal, my training history and my current plan below, decide what to change - from building a whole new plan to adjusting a single session - and reply with a change set.

Target Timeframe (the weeks you may change): ${targetWeekIds.join(", ")}

${memory}My Goal & Notes for this cycle:
${goal.trim() || "No specific goals provided. Optimize for general climbing performance."}

My training profile:
${profileText}

My current plan:
${planContext ?? ""}

${AI_CHANGESET_INSTRUCTIONS}`;
  }

  return `You are an elite climbing coach. Please analyze my training data and performance from the specified timeframe and give me detailed feedback.

Target Timeframe Analysed:
${targetWeekIds.join(", ")}

${memory}My Goal & Notes for this cycle:
${goal.trim() || "No specific goals provided. Just tell me what I did well and what I should change."}

Here is the data for the weeks in question:
${profileText}

Based on this data, please evaluate:
1. Did I train the right things for my goals?
2. Was my training load and frequency appropriate?
3. What are my apparent strengths and weaknesses?
4. What actionable changes should I make for my next training cycle?`;
}

/** Everything `buildCoachPromptFor` reads - `trainingState` satisfies it as is. */
export type CoachPromptSource = AIContextSource & Omit<PlanContextInput, "targetWeekIds" | "uncertainDays"> & {
  aiSharing: AISharingPreferences;
  athleteProfile?: AthleteProfile;
  coachNotes?: CoachNote[];
  readinessConfig?: ModelOptions["readiness"];
  fatigueHalfLife?: number;
  fatigueModel?: ModelOptions["fatigueModel"];
};

/**
 * Builds the whole prompt from app data: the profile, the plan context
 * ("generate" only) and the text around them. One path for the AI Coach's
 * copy button and every size preview, so a preview is the prompt's size.
 */
export function buildCoachPromptFor(
  source: CoachPromptSource,
  opts: { mode: AIPromptMode; targetWeekIds: string[]; goal: string; history: AIHistoryWindow; asOf?: Date; uncertainDays?: DayOfWeek[] },
): string {
  const { mode, goal, history } = opts;
  const targetWeekIds = mode === "context" ? [] : opts.targetWeekIds;
  const profile = buildAIContextProfile(
    mode,
    source,
    source.aiSharing,
    opts.asOf ?? new Date(),
    mode === "context" ? undefined : targetWeekIds,
    { readiness: source.readinessConfig, fatigueHalfLife: source.fatigueHalfLife, fatigueModel: source.fatigueModel },
    history,
  );
  // Fields named one by one, never spread: `trainingState` exposes them as
  // getters on its prototype, and a spread copies none of those.
  const planContext = mode === "generate"
    ? buildPlanContext({
        exerciseTypes: source.exerciseTypes,
        phaseDefs: source.phaseDefs,
        templates: source.templates,
        trainingBlocks: source.trainingBlocks,
        workouts: source.workouts,
        weekOverrides: source.weekOverrides,
        weekNotes: source.weekNotes,
        planAlternatives: source.planAlternatives,
        circuits: source.circuits,
        targetWeekIds,
        uncertainDays: opts.uncertainDays,
      })
    : undefined;
  // "coachNotes" is a newer sharing switch - absent in older saved preferences means on.
  const coachMemory = source.aiSharing.coachNotes !== false ? renderCoachMemory(source.athleteProfile, source.coachNotes ?? []) : "";
  return buildCoachPrompt({ mode, profile, targetWeekIds, goal, planContext, history, coachMemory });
}

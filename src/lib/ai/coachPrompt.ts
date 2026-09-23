import type { AIContextProfile, AIPromptMode } from "./context";
import { AI_CHANGESET_INSTRUCTIONS } from "./changeSetPrompt";

/**
 * The plan-level AI prompts, as text: "generate" (change the plan - the
 * reply comes back as a change set), "analyze" (feedback on a past window,
 * read in the chat) and "context" (just the profile, for your own
 * questions). Pure; the AI Coach modal gathers the inputs and copies it.
 */

/** Renders every present field of `profile` as a "- Label:\n<JSON>" section, joined with blank lines. */
export function renderProfileSections(profile: AIContextProfile, mode: AIPromptMode): string {
  const sections: string[] = [];
  if (profile.exerciseModalities) {
    sections.push(`- Custom Exercise Modalities (name, category, tracked fields):\n${profile.exerciseModalities.map((m) => JSON.stringify(m)).join("\n")}`);
  }
  if (profile.analyticsCategories) {
    sections.push(`- Analytics Categories (pick one for a new exercise's "categoryName" if you invent one - see the rules below):\n${JSON.stringify(profile.analyticsCategories, null, 2)}`);
  }
  // In "generate" the current-plan section already lists phases and blocks in full.
  if (profile.phases && mode !== "generate") {
    sections.push(`- Available Phases: ${profile.phases.join(", ")}.`);
  }
  sections.push(
    mode === "analyze"
      ? `- Completed Workouts (Target Timeframe):\n${JSON.stringify(profile.recentWorkouts, null, 2)}`
      : `- Recent Workouts (Last ${profile.recentWorkouts.length}):\n${JSON.stringify(profile.recentWorkouts, null, 2)}`,
  );
  sections.push(
    mode === "analyze"
      ? `- Benchmarks Recorded (Target Timeframe):\n${JSON.stringify(profile.benchmarks, null, 2)}`
      : `- My Benchmarks:\n${JSON.stringify(profile.benchmarks, null, 2)}`,
  );
  if (profile.trainingBlocks && mode !== "generate") {
    sections.push(`- Training Blocks (covering or near the timeframe):\n${JSON.stringify(profile.trainingBlocks, null, 2)}`);
  }
  if (profile.goals) {
    sections.push(`- Upcoming Goals (competitions and outdoor trips I'm peaking for; trips list the problems I want to send there):\n${JSON.stringify(profile.goals, null, 2)}`);
  }
  if (profile.readiness) {
    sections.push(`- Readiness Snapshot:\n${JSON.stringify(profile.readiness, null, 2)}`);
  }
  if (profile.painLogs) {
    sections.push(`- Recent Pain/Discomfort Logs:\n${JSON.stringify(profile.painLogs, null, 2)}`);
  }
  if (profile.outdoorAscents) {
    sections.push(`- Recent Outdoor Ascents:\n${JSON.stringify(profile.outdoorAscents, null, 2)}`);
  }
  if (profile.weekNotes && profile.weekNotes.length > 0) {
    sections.push(`- My Week Notes (circumstances and ideas I wrote down for specific weeks - take them into account):\n${JSON.stringify(profile.weekNotes, null, 2)}`);
  }
  return sections.join("\n\n");
}

export interface CoachPromptInput {
  mode: AIPromptMode;
  profile: AIContextProfile;
  /** The weeks the AI may change ("generate") or should review ("analyze"). */
  targetWeekIds: string[];
  goal: string;
  /** `buildPlanContext` output - "generate" only. */
  planContext?: string;
}

export function buildCoachPrompt(input: CoachPromptInput): string {
  const { mode, profile, targetWeekIds, goal, planContext } = input;
  const profileText = renderProfileSections(profile, mode);

  if (mode === "context") {
    return `Here is my condensed training profile (no specific question attached - I'll ask you directly after pasting this):

${profileText}`;
  }

  if (mode === "generate") {
    return `You are an elite climbing coach managing my training plan in an app. Based on my goal, my training history and my current plan below, decide what to change - from building a whole new plan to adjusting a single session - and reply with a change set.

Target Timeframe (the weeks you may change): ${targetWeekIds.join(", ")}

My Goal & Notes for this cycle:
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

My Goal & Notes for this cycle:
${goal.trim() || "No specific goals provided. Just tell me what I did well and what I should change."}

Here is the data for the weeks in question:
${profileText}

Based on this data, please evaluate:
1. Did I train the right things for my goals?
2. Was my training load and frequency appropriate?
3. What are my apparent strengths and weaknesses?
4. What actionable changes should I make for my next training cycle?`;
}

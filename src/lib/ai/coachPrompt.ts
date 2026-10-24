import { buildSinceLastPlan } from "./sinceLastPlan";
import type { AiChangeEntry } from "./changeLog";
import type { InsightInputs } from "../analytics/insights";
import { buildAIContextProfile, type AIContextProfile, type AIContextSource, type AIPromptMode, type ModelOptions } from "./context";
import { buildPlanContext, type PlanContextInput } from "./planContext";
import type { AISharingPreferences } from "../preferences/migrate";
import type { AIHistoryWindow } from "../preferences/migrate";
import { buildChangeSetInstructions, type ChangeSetPromptOptions } from "./changeSetPrompt";
import { renderCoachMemory, COACH_MEMORY_READ_ONLY } from "./coachNotes";
import type { AthleteProfile, CoachNote } from "../types";
import type { DayOfWeek } from "../types";
import { weekDatesText, weekLabel } from "../dateUtils";
import { buildCalendarContext } from "../calendar/aiCalendar";
import type { DeviceEvent } from "../calendar/deviceEvents";

/**
 * The plan-level AI prompts, as text: "generate" (change the plan - the
 * reply comes back as a change set), "analyze" (feedback on a past window,
 * read in the chat) and "context" (just the profile, for the user's own
 * questions). Pure; the AI Coach modal gathers the inputs and copies it.
 */

/**
 * One JSON object per line, no indentation. The same data as pretty-printed
 * JSON at roughly 60% of the size, and just as readable to a model.
 */
function lines(items: unknown[]): string {
  return items.length ? items.map((i) => JSON.stringify(withDates(i))).join("\n") : "(none)";
}

/** An item that names a week or a run of weeks also gets the calendar dates, so the model needn't work them out from "2026-W40". */
function withDates(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const o = item as Record<string, unknown>;
  if (typeof o.weekId === "string") {
    const dates = weekDatesText(o.weekId);
    return dates ? { ...o, weekDates: dates } : item;
  }
  if (typeof o.startWeekId === "string" && typeof o.endWeekId === "string") {
    const dates = weekDatesText(o.startWeekId, o.endWeekId);
    return dates ? { ...o, dates } : item;
  }
  return item;
}

/** What a session line's numbers mean - without it "load" and the four ratings are guesswork. */
const SESSION_LEGEND = "; load = score from my after-session ratings, fingers/arms/core/systemic = those ratings 1-10, exercise values as logged";

/** Renders every present field of `profile` as a "- Label:" section, joined with blank lines. */
export function renderProfileSections(profile: AIContextProfile, mode: AIPromptMode, history?: AIHistoryWindow): string {
  const sections: string[] = [];
  if (profile.exerciseModalities) {
    sections.push(`- Custom Exercise Modalities (name, analytics category, library group, tracked fields; "noHowTo" = it has no how-to text yet):\n${lines(profile.exerciseModalities)}`);
  }
  if (profile.customValues) {
    sections.push(`- ${profile.customValues}`);
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
    sections.push(`- Completed Workouts (Target Timeframe${SESSION_LEGEND}):\n${lines(profile.recentWorkouts)}`);
  } else {
    const weeks = history?.fullWeeks;
    sections.push(`- Completed Sessions${weeks ? ` (last ${weeks} week${weeks === 1 ? "" : "s"}, in full${SESSION_LEGEND})` : ` (${SESSION_LEGEND.slice(2)})`}:\n${lines(profile.recentWorkouts)}`);
  }
  if (profile.weeklyHistory?.length) {
    sections.push(`- Weekly History before that (one line per week, oldest first: sessions, total minutes, summed load, logged minutes per category, average post-session ratings 1-10):\n${lines(profile.weeklyHistory)}`);
  }
  sections.push(
    mode === "analyze"
      ? `- Test Results Recorded (Target Timeframe):\n${lines(profile.benchmarks)}`
      : `- My Test Results (every result so far, with the conditions it was done under):\n${lines(profile.benchmarks)}`,
  );
  if (profile.tests?.length) {
    sections.push(`- Tests (benchmark tests I repeat - what each records, when it was last done, and whether it is due ("neverDone" = no result yet, optional). "plannedIn" = already scheduled, don't add it again. In a "Change plan" you may schedule one inside a session; see TEST in the rules below):\n${lines(profile.tests)}`);
  }
  if (profile.trainingBlocks && mode !== "generate") {
    sections.push(`- Training Blocks (covering or near the timeframe):\n${lines(profile.trainingBlocks)}`);
  }
  if (profile.goals?.length) {
    sections.push(`- Upcoming Goals (competitions and outdoor trips I'm peaking for; trips list the problems I want to send there):\n${lines(profile.goals)}`);
  }
  if (profile.places?.length) {
    sections.push(`- My Places (where I train, with what it costs, when it is open and what to know; a session can say where it is with "place": <one of these names>, and the "places" section adds, edits or removes places - pick the place that suits the session: boards, outdoor or not, opening hours against its start time):\n${lines(profile.places)}`);
  }
  if (profile.calendar && profile.calendar.entries.length > 0) {
    sections.push(`- My Calendar (what else is on in the target weeks, from my phone calendar - title and time only. Plan around it: no session on top of an event, rest before something big, a lighter day after a late night; "allDay" entries block the day only when the title says it matters (a trip, a flight) - a birthday does not):\n${lines(profile.calendar.entries)}${profile.calendar.more ? `\n(and ${profile.calendar.more} more, not shown)` : ""}`);
  }
  if (profile.readiness) {
    sections.push(`- Readiness Snapshot:\n${JSON.stringify(profile.readiness)}`);
  }
  if (profile.recovery) {
    sections.push(`- Recovery Data (from my watch and my own entries; use it to judge how hard to train and when to rest):\n${JSON.stringify(profile.recovery)}`);
  }
  if (profile.otherTraining) {
    sections.push(`- Other Training (not climbing - count it as real load when planning rest and intensity):\n${JSON.stringify(profile.otherTraining)}`);
  }
  if (profile.patterns?.length) {
    sections.push(`- Patterns In My Own Data (hints from my history, not proof):\n${profile.patterns.map((p) => `- ${p}`).join("\n")}`);
  }
  if (profile.weeklyReviews?.length) {
    sections.push(`- My Last Weeks In Brief (climbing, other training, recovery; oldest first):\n${profile.weeklyReviews.map((r) => `${r.week}: ${r.lines.join(" ")}${r.remark ? ` Note: ${r.remark}` : ""}`).join("\n")}`);
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
  /** What happened since the plan was last changed (`buildSinceLastPlan`) - empty when there's nothing yet. */
  sinceLast?: string;
  /** Which optional parts of the reply contract to spell out ("generate" only); all of them when absent. */
  contract?: ChangeSetPromptOptions;
}

const PLAN_B_ASKED = /plan\s*b|uncertain|either way|depending on (the )?weather|if it rains|rain|weather|dry\b/i;
const PLACE_ASKED = /\b(places?|gyms?|crags?|venues?|locations?|boulderwelt)\b/i;

/**
 * The parts of the reply contract this request can use: Plan B only with
 * uncertain days, a Plan B already in the plan or a request that mentions
 * one; tests only with a Tests section; coach notes when sharing them is
 * on; places when I have some or the request names one.
 */
export function contractFor(input: { profile: AIContextProfile; goal: string; planContext?: string; uncertainDays?: DayOfWeek[]; coachNotes: boolean }): ChangeSetPromptOptions {
  const { profile, goal, planContext, uncertainDays, coachNotes } = input;
  return {
    planB: !!uncertainDays?.length || !!planContext?.includes("PLAN B -") || PLAN_B_ASKED.test(goal),
    tests: !!profile.tests?.length,
    coachNotes,
    places: !!profile.places?.length || PLACE_ASKED.test(goal),
  };
}

export function buildCoachPrompt(input: CoachPromptInput): string {
  const { mode, profile, targetWeekIds, goal, planContext, history, coachMemory, sinceLast, contract } = input;
  const profileText = renderProfileSections(profile, mode, history);
  // The coaching memory comes first: it's what every AI coach should know
  // before reading the data. Only a change set can update it.
  const memory = coachMemory?.trim()
    ? `My coaching memory:\n${coachMemory.trim()}\n${mode === "generate" ? 'Use it throughout. You may update the coach notes - see "coachNotes" below.' : COACH_MEMORY_READ_ONLY}\n\n`
    : "";

  if (mode === "context") {
    return `${memory}Here is my condensed training profile (no specific question attached - I'll ask you directly after pasting this):

${profileText}${sinceLast ? `\n\n${sinceLast}` : ""}`;
  }

  if (mode === "generate") {
    return `You are an elite climbing coach managing my training plan in an app. Based on my goal, my training history and my current plan below, decide what to change - from building a whole new plan to adjusting a single session - and reply with a change set.

Target Timeframe (the weeks you may change): ${targetWeekIds.map(weekLabel).join(", ")}

${memory}My Goal & Notes for this cycle:
${goal.trim() || "No specific goals provided. Optimize for general climbing performance."}

My training profile:
${profileText}
${sinceLast ? `\n${sinceLast}\n` : ""}
My current plan:
${planContext ?? ""}

${buildChangeSetInstructions(contract)}`;
  }

  return `You are an elite climbing coach. Please analyze my training data and performance from the specified timeframe and give me detailed feedback.

Target Timeframe Analysed:
${targetWeekIds.map(weekLabel).join(", ")}

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
  retestWeeks?: number;
  /** How much recovery data and other training the prompt carries. */
  aiDetail?: ModelOptions["detail"];
  /** The same inputs the Insights tab reads - with them (and a change log) the prompt carries "since the last plan". */
  insightInputs?: () => InsightInputs;
};

/**
 * Builds the whole prompt from app data: the profile, the plan context
 * ("generate" only) and the text around them. One path for the AI Coach's
 * copy button and every size preview, so a preview is the prompt's size.
 */
export function buildCoachPromptFor(
  source: CoachPromptSource,
  opts: { mode: AIPromptMode; targetWeekIds: string[]; goal: string; history: AIHistoryWindow; asOf?: Date; uncertainDays?: DayOfWeek[]; changeLog?: AiChangeEntry[]; compact?: boolean; calendar?: DeviceEvent[] },
): string {
  const { mode, goal, history } = opts;
  const targetWeekIds = mode === "context" ? [] : opts.targetWeekIds;
  const profile = buildAIContextProfile(
    mode,
    source,
    source.aiSharing,
    opts.asOf ?? new Date(),
    mode === "context" ? undefined : targetWeekIds,
    { readiness: source.readinessConfig, fatigueHalfLife: source.fatigueHalfLife, fatigueModel: source.fatigueModel, retestWeeks: source.retestWeeks, compact: opts.compact, detail: source.aiDetail },
    history,
  );
  // The phone calendar: only when sharing it is switched on (it is off by default) and there are weeks to plan.
  if (mode !== "context" && source.aiSharing.phoneCalendar === true && opts.calendar) {
    const calendar = buildCalendarContext(opts.calendar);
    if (calendar.entries.length > 0) profile.calendar = calendar;
  }
  // Fields named one by one, never spread: `trainingState` exposes them as
  // getters on its prototype, and a spread copies none of those.
  const planContext = mode === "generate"
    ? buildPlanContext({
        exerciseTypes: source.exerciseTypes,
        phaseDefs: source.phaseDefs,
        templates: source.templates,
        trainingBlocks: source.trainingBlocks,
        workouts: source.workouts,
        dismissedSessions: source.dismissedSessions,
        weekNotes: source.weekNotes,
        planAlternatives: source.planAlternatives,
        circuits: source.circuits,
        benchmarkTypes: source.benchmarkTypes,
        valueDefs: source.valueDefs,
        targetWeekIds,
        uncertainDays: opts.uncertainDays,
        compact: opts.compact,
      })
    : undefined;
  // "coachNotes" is a newer sharing switch - absent in older saved preferences means on.
  const coachMemory = source.aiSharing.coachNotes !== false ? renderCoachMemory(source.athleteProfile, source.coachNotes ?? [], source.analyticsCategories) : "";
  const sinceLast = (mode === "generate" || mode === "context") && source.insightInputs
    ? buildSinceLastPlan({
        inputs: source.insightInputs(),
        changeLog: opts.changeLog ?? [],
        share: { readinessMetrics: source.aiSharing.readinessMetrics, outdoorAscents: source.aiSharing.outdoorAscents },
      })
    : "";
  const contract = mode === "generate" ? contractFor({ profile, goal, planContext, uncertainDays: opts.uncertainDays, coachNotes: source.aiSharing.coachNotes !== false }) : undefined;
  return buildCoachPrompt({ mode, profile, targetWeekIds, goal, planContext, history, coachMemory, sinceLast, contract });
}

import { estimateTokens } from "./coachPrompt";

/**
 * Keeping the prompt small: whether the athlete wants the compact version
 * (kept per device), and a breakdown of what a finished prompt is made of,
 * so "46k tokens" can be traced to the part that takes the space.
 */

export const COMPACT_KEY = "bt.aiCompact";

type Store = Pick<Storage, "getItem" | "setItem">;
function browserStore(): Store | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Compact unless the athlete chose the full prompt. */
export function loadCompact(store: Store | undefined = browserStore()): boolean {
  try {
    return store?.getItem(COMPACT_KEY) !== "full";
  } catch {
    return true;
  }
}

export function saveCompact(compact: boolean, store: Store | undefined = browserStore()): void {
  try {
    store?.setItem(COMPACT_KEY, compact ? "compact" : "full");
  } catch {
    /* it just resets next time */
  }
}

export interface PromptPart { label: string; tokens: number }

/** [pattern at the start of a line, what to call the part it begins]. Order matters: first match wins. */
const PARTS: [RegExp, string][] = [
  [/^My coaching memory:/, "Coaching memory"],
  [/^My Goal/, "Your request"],
  [/^My training profile:/, "Profile"],
  [/^- Custom Exercise Modalities/, "Your exercises"],
  [/^- Completed (Sessions|Workouts)/, "Completed sessions"],
  [/^- Weekly History/, "Older weeks, one line each"],
  [/^- (My Test Results|Test Results Recorded)/, "Test results"],
  [/^- Tests /, "Tests"],
  [/^- Recent Outdoor Ascents/, "Outdoor ascents"],
  [/^- Readiness Snapshot/, "Readiness snapshot"],
  [/^- Recovery Data/, "Recovery"],
  [/^- Other Training/, "Other training"],
  [/^- Patterns/, "Patterns"],
  [/^- My Last Weeks/, "Last weeks in brief"],
  [/^- Upcoming Goals/, "Goals"],
  [/^- My Places/, "Places"],
  [/^- My Calendar/, "Phone calendar"],
  [/^- My Week Notes/, "Week notes"],
  [/^- Training Blocks/, "Training blocks"],
  [/^- (Analytics Categories|Archived Exercises|Available Phases|MY OWN VALUE TYPES)/, "Exercise lists and fields"],
  [/^- Pain Issues/, "Pain"],
  [/^- About me/, "About me"],
  [/^Since the plan was last changed/, "Since the last plan"],
  [/^My current plan:/, "Plan"],
  [/^SAVED CIRCUITS/, "Saved circuits"],
  [/^PHASES/, "Phases and their typical weeks"],
  [/^BLOCKS overlapping/, "Training blocks"],
  [/^TARGET WEEKS/, "The weeks to change"],
  [/^PLAN B/, "Plan B"],
  [/^HOW TO ANSWER/, "Rules for the reply"],
];

/**
 * The parts of a prompt with their size in tokens, biggest first. A part
 * runs from its heading to the next one; text before the first heading and
 * anything unrecognised is counted with the part above it.
 */
export function promptBreakdown(prompt: string): PromptPart[] {
  const lines = prompt.split("\n");
  const parts = new Map<string, number>();
  let current = "Introduction";
  for (const line of lines) {
    const hit = PARTS.find(([re]) => re.test(line));
    if (hit) current = hit[1];
    parts.set(current, (parts.get(current) ?? 0) + line.length + 1);
  }
  return [...parts.entries()].map(([label, chars]) => ({ label, tokens: estimateTokens("x".repeat(chars)) })).sort((a, b) => b.tokens - a.tokens);
}

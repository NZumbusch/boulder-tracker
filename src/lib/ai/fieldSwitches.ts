import type { DailyMetricEntry, ExternalActivity } from "../types";
import { AI_FIELD_KEYS, type AIFields, type AIHistoryWindow, type AIRecoveryDetail } from "../preferences/migrate";
import type { ExternalLoadConfig } from "../activity/externalLoad";
import { buildOtherTrainingContext, buildRecoveryContext } from "./wellnessContext";
import { estimateTokens } from "./coachPrompt";

/**
 * The switches for what Garmin-type data goes into a prompt, each with what
 * it costs on your own data (Settings -> What the AI sees). Cost is measured,
 * not guessed: the section with only that group on, against the same section
 * with every group off.
 */

export interface FieldInfo {
  key: keyof AIFields;
  /** Which section the group adds to. */
  section: "activity" | "recovery";
  label: string;
  hint: string;
}

export const AI_FIELD_INFO: FieldInfo[] = [
  { key: "pace", section: "activity", label: "Pace and splits", hint: "Pace or speed, each kilometre of a run, a workout's laps, and how the second half differed from the first." },
  { key: "zones", section: "activity", label: "Heart-rate zones", hint: "Minutes in each zone, from your highest heart rate." },
  { key: "effect", section: "activity", label: "What it trained, rating and feel", hint: "What Garmin says the activity trained, the rating and feel you gave on the watch, and the Body Battery it cost (Garmin imports only)." },
  { key: "terrain", section: "activity", label: "Climb, cadence, stride", hint: "Ascent and descent, cadence, stride length (and power and temperature where the recording has them)." },
  { key: "vo2max", section: "recovery", label: "VO2max", hint: "Your running VO2max, in the recovery data." },
  { key: "sleepStages", section: "recovery", label: "Deep and REM sleep", hint: "Minutes of deep and REM sleep, in the recovery data." },
];

const ALL_OFF = Object.fromEntries(AI_FIELD_KEYS.map((k) => [k, false])) as unknown as AIFields;

export interface FieldCost {
  /** Tokens this group adds to the prompt, on the data you have. */
  tokens: number;
  /** False when nothing in your data feeds it (no imported detail yet, no such readings). */
  hasData: boolean;
}

export interface FieldCostInput {
  activities: ExternalActivity[];
  dailyMetrics: DailyMetricEntry[];
  today: Date;
  history: AIHistoryWindow;
  loadConfig?: ExternalLoadConfig;
  recoveryDetail: AIRecoveryDetail;
}

export function fieldCosts(input: FieldCostInput): Record<keyof AIFields, FieldCost> {
  const { activities, dailyMetrics, today, history, loadConfig, recoveryDetail } = input;
  const weeks = Math.min(12, Math.max(1, history.fullWeeks + history.summaryWeeks));
  // The activity groups only show in the "Every activity" list, so they are measured as if it were on.
  const activityTokens = (fields: AIFields) => estimateTokens(JSON.stringify(buildOtherTrainingContext(activities, today, "list", history, loadConfig, fields) ?? ""));
  const recoveryTokens = (fields: AIFields) => estimateTokens(JSON.stringify(buildRecoveryContext(dailyMetrics, today, recoveryDetail, weeks, fields) ?? ""));
  const baseActivity = activityTokens(ALL_OFF);
  const baseRecovery = recoveryTokens(ALL_OFF);
  const out = {} as Record<keyof AIFields, FieldCost>;
  for (const info of AI_FIELD_INFO) {
    const only = { ...ALL_OFF, [info.key]: true };
    const tokens = Math.max(0, (info.section === "activity" ? activityTokens(only) - baseActivity : recoveryTokens(only) - baseRecovery));
    out[info.key] = { tokens, hasData: tokens > 0 };
  }
  return out;
}

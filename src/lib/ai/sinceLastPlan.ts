import type { Workout } from "../types";
import { decrementWeekId, getWeekId } from "../dateUtils";
import { isSkippedWorkout, workoutDay, isoDayIndex } from "../planning/weekStatus";
import { planProgress } from "../planning/weekRecap";
import { WEEK_DAYS } from "../constants";
import { buildInsights, type InsightInputs } from "../analytics/insights";
import type { AiChangeEntry } from "./changeLog";

/**
 * The feedback half of the plan -> AI -> adapt loop: what happened since
 * the plan was last changed, in the app's own numbers - what the AI last
 * changed and why, how each recent week went against its plan, and the
 * findings the Insights tab shows. Without it the AI plans the next week
 * blind to whether the last one worked.
 */

const WEEKS_BACK = 2;
const MAX_FINDINGS = 12;
const MAX_LOG_ENTRIES = 3;

const n0 = (v: number) => Math.round(v).toLocaleString("en");
const day = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
const weekNo = (id: string) => `W${id.split("-W")[1]}`;

export interface SinceLastPlanOptions {
  inputs: InsightInputs;
  changeLog: AiChangeEntry[];
  /** Sharing switches that hide findings built on that data. */
  share?: { readinessMetrics?: boolean; outdoorAscents?: boolean };
}

function weekLine(weekId: string, sessions: Workout[], running: boolean, todayIndex: number, previousLoad?: number): string {
  const done = sessions.filter((w) => w.status === "completed");
  const left = sessions.filter((w) => w.status === "planned" && !isSkippedWorkout(w));
  const missed = left.filter((w) => {
    if (!running) return true;
    const d = workoutDay(w);
    return d !== undefined && isoDayIndex(d) < todayIndex;
  });
  const load = done.reduce((s, w) => s + (w.loadFactor || 0), 0);
  const progress = planProgress(sessions);
  const parts = [
    `${done.length} of ${done.length + left.length} sessions done${running ? " so far" : ""}`,
    missed.length ? `${missed.length} missed (${missed.map((w) => w.notes || "Session").slice(0, 4).join(", ")})` : undefined,
    `load ${n0(load)}`,
    previousLoad && previousLoad > 0 && !running ? `${load >= previousLoad ? "+" : "-"}${Math.abs(Math.round((load / previousLoad - 1) * 100))}% vs the week before` : undefined,
    progress !== undefined ? `${Math.round(progress * 100)}% of the planned work` : undefined,
  ].filter(Boolean);
  return `- ${weekNo(weekId)}${running ? " (this week, running)" : ""}: ${parts.join(" · ")}`;
}

/** The section, or "" when there's nothing to say yet. */
export function buildSinceLastPlan({ inputs, changeLog, share }: SinceLastPlanOptions): string {
  const out: string[] = [];

  const recent = changeLog.slice(-MAX_LOG_ENTRIES);
  if (recent.length) {
    out.push("What the app last changed on my request:");
    for (const e of recent) {
      const weeks = e.weeks.length ? ` for ${e.weeks.length === 1 ? weekNo(e.weeks[0]) : `${weekNo(e.weeks[0])}-${weekNo(e.weeks[e.weeks.length - 1])}`}` : "";
      out.push(`- ${day(e.at)}${weeks}${e.goal ? ` - I asked: "${e.goal.replace(/\s+/g, " ")}"` : ""}`);
      for (const line of e.lines) out.push(`    ${line}`);
    }
  }

  const thisWeek = getWeekId(inputs.asOf);
  const todayIndex = isoDayIndex(WEEK_DAYS[(inputs.asOf.getDay() + 6) % 7]);
  const weekIds = [thisWeek];
  for (let i = 0; i < WEEKS_BACK; i++) weekIds.unshift(decrementWeekId(weekIds[0]));
  const loadOf = (id: string) => inputs.workoutsForWeek(id).filter((w) => w.status === "completed").reduce((s, w) => s + (w.loadFactor || 0), 0);
  const weeks = weekIds
    .map((id) => ({ id, sessions: inputs.workoutsForWeek(id) }))
    .filter((w) => w.sessions.length > 0);
  if (weeks.length) {
    out.push("", "How the recent weeks went against their plans:");
    for (const w of weeks) out.push(weekLine(w.id, w.sessions, w.id === thisWeek, todayIndex, loadOf(decrementWeekId(w.id))));
  }

  const hidden = new Set<string>();
  if (share?.readinessMetrics === false) { hidden.add("hrv"); hidden.add("sleep"); }
  if (share?.outdoorAscents === false) hidden.add("sends");
  const findings = buildInsights(inputs).filter((i) => !hidden.has(i.id)).slice(0, MAX_FINDINGS);
  if (findings.length) {
    out.push("", "What the app has worked out from my data (the same findings I see):");
    for (const f of findings) out.push(`- ${f.title}${f.detail ? ` - ${f.detail}` : ""}`);
  }

  if (out.length === 0) return "";
  return `Since the plan was last changed (computed by the app):\n${out.join("\n")}`;
}

import type { InsightGroup } from "../analytics/insights";

/** What the "ask the AI about this" sheet is open for, if anything. */
export type AskSubject = { kind: "insights"; group: InsightGroup } | { kind: "session"; workoutId: string };

class AskAboutState {
  subject = $state<AskSubject | null>(null);
}

export const askAbout = new AskAboutState();

export const askAboutInsights = (group: InsightGroup) => (askAbout.subject = { kind: "insights", group });
export const askAboutSession = (workoutId: string) => (askAbout.subject = { kind: "session", workoutId });

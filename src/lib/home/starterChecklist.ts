import type { DataCounts } from "./newUser";

/**
 * Home's "Get started" card: a few first steps, ticked from what's in the
 * app (not from tapping), that goes away by itself - when they're done, when
 * it's closed, or when the person has clearly found their feet (3 sessions).
 */
export interface ChecklistInput extends DataCounts {
  trainingBlocks: unknown[];
  /** The guided tour has been started on this device. */
  tourSeen: boolean;
  dismissed: boolean;
  /** Google Drive sync exists on this device (the Android app). */
  syncAvailable: boolean;
  syncConnected: boolean;
}

export type ChecklistItemId = "plan" | "session" | "metric" | "tour" | "sync";

export interface ChecklistItem {
  id: ChecklistItemId;
  label: string;
  hint: string;
  done: boolean;
  /** Doesn't count towards finishing the card. */
  optional?: boolean;
}

export interface Checklist {
  items: ChecklistItem[];
  doneCount: number;
  /** Required items only. */
  total: number;
  visible: boolean;
}

/** Sessions after which the card stops appearing, finished or not. */
export const CHECKLIST_SESSIONS_CAP = 3;

export function buildChecklist(input: ChecklistInput): Checklist {
  const completed = input.workouts.filter((w) => w.status === "completed").length;
  const items: ChecklistItem[] = [
    { id: "plan", label: "Plan your first weeks", hint: "Pick a phase for the coming weeks", done: input.trainingBlocks.length > 0 || input.workouts.length > 0 },
    { id: "session", label: "Do your first session", hint: "Start one live, or log it afterwards", done: completed > 0 },
    { id: "metric", label: "Log your bodyweight", hint: "One number starts the trend charts", done: input.dailyMetrics.length > 0 },
    { id: "tour", label: "Take the tour", hint: "Every screen, on example data", done: input.tourSeen },
  ];
  if (input.syncAvailable) items.push({ id: "sync", label: "Turn on Google Drive sync", hint: "Keeps your phones and tablets in step", done: input.syncConnected, optional: true });
  const required = items.filter((i) => !i.optional);
  const doneCount = required.filter((i) => i.done).length;
  return {
    items,
    doneCount,
    total: required.length,
    visible: !input.dismissed && doneCount < required.length && completed < CHECKLIST_SESSIONS_CAP,
  };
}

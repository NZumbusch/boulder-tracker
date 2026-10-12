import type { ExerciseValues } from "../types";
import type { PresetVariant } from "./presets";

/**
 * The timer outside a planned exercise: a run made up on the spot (a
 * pacer for a free bouldering session, a countdown, a repeater from a
 * preset). It is the same run as a single exercise's - `soloRun` fed by the
 * Timer sheet's numbers - but tied to no session: nothing is logged.
 */

export interface QuickRun {
  /** A new key per start, so a fresh run never inherits the last one's saved state. */
  key: string;
  /** Shown in the runner's header: "Pacer", a preset's name. */
  title: string;
  variant: PresetVariant;
  values: ExerciseValues;
  leadIn: number;
}

export const quickTimer = $state<{ sheetOpen: boolean; run: QuickRun | null; minimized: boolean }>({ sheetOpen: false, run: null, minimized: false });

export function openQuickTimerSheet() {
  quickTimer.sheetOpen = true;
}

export function closeQuickTimerSheet() {
  quickTimer.sheetOpen = false;
}

export function startQuickRun(run: Omit<QuickRun, "key">) {
  quickTimer.run = { ...run, key: String(Date.now()) };
  quickTimer.sheetOpen = false;
  quickTimer.minimized = false;
}

export function endQuickRun() {
  quickTimer.run = null;
  quickTimer.minimized = false;
}

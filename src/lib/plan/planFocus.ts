/*
 * What the Plan's two views hand to each other: the day (and the session, when one was opened) you last touched, so
 * switching between Weeks and Calendar lands where you were instead of on the week alone. Each view writes it when you
 * tap a day or open a session; the *other* view reads it once, when it appears. In memory only - a restart forgets it.
 */

export type PlanView = "weeks" | "calendar";

export interface PlanFocus {
  /** "YYYY-MM-DD". */
  day: string;
  sessionId?: string;
  /** The view that left it. */
  from: PlanView;
}

let current: (PlanFocus & { taken: boolean }) | undefined;

export const planFocus = {
  /** `from` touched `day` (and the session `sessionId`, when it was opened). */
  set(from: PlanView, day: string, sessionId?: string): void {
    current = { from, day, sessionId, taken: false };
  },
  /** What `reader` should land on: only what the other view left, and only once. */
  take(reader: PlanView): PlanFocus | undefined {
    if (!current || current.from === reader || current.taken) return undefined;
    current.taken = true;
    const { taken: _taken, ...focus } = current;
    return focus;
  },
  /** What is stored, whoever it is for (it does not mark it as read). */
  peek(): PlanFocus | undefined {
    if (!current) return undefined;
    const { taken: _taken, ...focus } = current;
    return focus;
  },
  clear(): void {
    current = undefined;
  },
};

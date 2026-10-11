import type { WeekNote } from "../types";

/** The prefix that marks text an AI import added to a note, so it reads apart from what the user wrote. */
export const AI_NOTE_PREFIX = "AI: ";

/**
 * `notes` with `weekId`'s note set to `text` (trimmed) - replacing any
 * existing one, or removing it when `text` is blank. Pure; the input array
 * is not modified.
 */
export function upsertWeekNote(notes: WeekNote[], weekId: string, text: string): WeekNote[] {
  const trimmed = text.trim();
  const others = notes.filter((n) => n.weekId !== weekId);
  if (!trimmed) return others;
  const index = notes.findIndex((n) => n.weekId === weekId);
  if (index === -1) return [...notes, { weekId, text: trimmed }];
  return notes.map((n) => (n.weekId === weekId ? { weekId, text: trimmed } : n));
}

/** The note for `weekId`, or "" if it has none. */
export function weekNoteText(notes: WeekNote[], weekId: string): string {
  return notes.find((n) => n.weekId === weekId)?.text ?? "";
}

/**
 * Adds an AI import's note text below whatever the user already wrote,
 * marked with `AI_NOTE_PREFIX` - an import never replaces the user's own
 * words. Re-importing the same plan doesn't stack a second copy of a line
 * that's already there.
 */
export function appendAINote(existing: string | undefined, aiText: string): string {
  const current = (existing ?? "").trim();
  const addition = aiText.trim();
  if (!addition) return current;
  const line = `${AI_NOTE_PREFIX}${addition}`;
  if (!current) return line;
  if (current.includes(line)) return current;
  return `${current}\n\n${line}`;
}

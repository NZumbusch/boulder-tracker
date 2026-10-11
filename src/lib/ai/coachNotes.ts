import type { AthleteProfile, CoachNote } from "../types";

/**
 * The AI coach's memory: About me (the athlete writes it) and coach notes
 * (an AI proposes them, the athlete ticks each one in the review, or writes
 * their own). Both go into every AI prompt, so nothing has to be restated
 * in each new chat - and whatever one AI worked out, the next one knows,
 * in any AI app. The AI can't write anything by itself: its notes arrive in
 * the change set it replies with, like plan changes, and only what the
 * athlete ticks is saved.
 */

export const MAX_COACH_NOTES = 20;
export const MAX_COACH_NOTE_LENGTH = 240;

/** A short id the AI can quote ("k3x9"), unique among `existing`. */
export function newCoachNoteId(existing: { id: string }[], random: () => number = Math.random): string {
  const taken = new Set(existing.map((n) => n.id));
  for (;;) {
    const id = Array.from({ length: 4 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(random() * 32)]).join("");
    if (!taken.has(id)) return id;
  }
}

const PROFILE_LINES: [keyof AthleteProfile, string, (v: never) => string][] = [
  ["heightCm", "Height", (v: number) => `${v} cm`],
  ["apeIndexCm", "Ape index", (v: number) => `${v > 0 ? "+" : ""}${v} cm`],
  ["climbingSince", "Climbing since", (v: number) => String(v)],
  ["maxBoulderIndoor", "Hardest boulder indoors", (v: string) => v],
  ["maxBoulderOutdoor", "Hardest boulder outdoors", (v: string) => v],
  ["boardLevels", "Board levels", (v: string) => v],
  ["injuries", "Injuries / careful with", (v: string) => v],
  ["availability", "Availability & equipment", (v: string) => v],
  ["longTermGoals", "Long-term goals", (v: string) => v],
  ["other", "Other", (v: string) => v],
];

/** Whether About me has anything in it. */
export function hasProfile(profile: AthleteProfile | undefined): boolean {
  if (!profile) return false;
  return PROFILE_LINES.some(([key]) => profile[key] !== undefined && profile[key] !== "") || !!profile.standingGoal?.trim();
}

/**
 * The prompt section: About me, the standing goal, and the coach notes
 * with their ids - or nothing at all when all three are empty.
 */
export function renderCoachMemory(profile: AthleteProfile | undefined, notes: CoachNote[]): string {
  const parts: string[] = [];
  const about = PROFILE_LINES
    .filter(([key]) => profile?.[key] !== undefined && profile?.[key] !== "")
    .map(([key, label, show]) => `  - ${label}: ${show(profile![key] as never)}`);
  if (about.length) parts.push(`- About me (written by me, always current):\n${about.join("\n")}`);
  if (profile?.standingGoal?.trim()) parts.push(`- My standing goal (what to work towards unless a request says otherwise): ${profile.standingGoal.trim()}`);
  if (notes.length) {
    parts.push(
      `- Coach notes (${notes.length} of ${MAX_COACH_NOTES}) - memory from earlier coaching, id in brackets; "me" = written by me:\n` +
        notes.map((n) => `  [${n.id}] ${n.text} (${n.source === "me" ? "me" : "AI"}, ${n.updatedOn ?? n.addedOn})`).join("\n"),
    );
  }
  return parts.join("\n");
}

/** How the AI should treat the memory when it can only read it (analysis, a free chat). */
export const COACH_MEMORY_READ_ONLY =
  "About me, my standing goal and the coach notes above are my coaching memory: treat them as true unless my data or I say otherwise, and don't ask me for what they already answer.";

/**
 * The change-set section's instructions - exactly how notes are used and
 * kept, so each AI keeps the list useful rather than
 * growing it.
 */
export const COACH_NOTES_INSTRUCTIONS = `5) "coachNotes" - the coaching memory (optional; leave it out when there's nothing worth keeping).
  What they are: short notes that EVERY future AI coach reads at the start of every conversation, in any AI app, next to "About me" and my standing goal (see "Coach notes" above for the current ones, each with its id). They are how what you learned about me survives this chat.
  How they are used: each future prompt lists all of them, so keep each one self-contained, specific and durable - true next month, not just this week.
  What belongs: lasting insights the data doesn't show - how I respond to training ("recovers slowly from max hangs, keep 72 h between"), limitations and injuries to respect, preferences ("hates 4x4s, likes pyramids"), what worked or didn't in past blocks, the long-term direction we agreed. Not: the plan itself or this week's details (use block/week/session notes), my goals and trips, benchmarks, sessions or pain logs (the app already sends those), or anything already in About me.
  How to change them:
    { "action": "add", "text": "One short note, at most ${MAX_COACH_NOTE_LENGTH} characters." }
    { "action": "edit", "id": "k3x9", "text": "The updated note." }
    { "action": "remove", "id": "k3x9" }
  Rules:
  - At most ${MAX_COACH_NOTES} notes in total, and fewer is better - only add a note when you learned something worth keeping; zero changes is a fine answer. If the list would pass ${MAX_COACH_NOTES}, merge or remove notes first (edit one into a combined note, remove the other).
  - Keep the list current: edit a note that changed, remove one that is wrong or out of date, merge two that overlap. Prefer editing an existing note over adding a near-duplicate.
  - Notes marked "me" are mine: don't edit or remove them unless I asked you to.
  - I review every change before it is saved and can edit any note myself, so say why in your "summary" when you change the notes.`;

export type CoachNoteChange =
  | { action: "add"; text: string }
  | { action: "edit"; id: string; text: string }
  | { action: "remove"; id: string };

export interface CoachNoteOutcome {
  notes: CoachNote[];
  /** "+ …", "~ …", "− …" for the review. */
  line: string;
  warnings: string[];
  error?: string;
}

/** One change applied to `notes` (a copy is returned). */
export function applyCoachNoteChange(notes: CoachNote[], change: CoachNoteChange, today: string, newId: () => string): CoachNoteOutcome {
  if (change.action === "add") {
    if (notes.length >= MAX_COACH_NOTES) {
      return { notes, line: `+ ${change.text}`, warnings: [], error: `There are already ${MAX_COACH_NOTES} notes - remove or merge one first.` };
    }
    const dup = notes.find((n) => n.text.trim().toLowerCase() === change.text.trim().toLowerCase());
    if (dup) return { notes, line: `+ ${change.text}`, warnings: [], error: `The same note already exists [${dup.id}].` };
    return { notes: [...notes, { id: newId(), text: change.text, source: "ai", addedOn: today }], line: `+ ${change.text}`, warnings: [] };
  }
  const target = notes.find((n) => n.id === change.id);
  if (!target) return { notes, line: `${change.action === "edit" ? "~" : "−"} [${change.id}]`, warnings: [], error: `No coach note [${change.id}].` };
  const warnings = target.source === "me" ? ["This is one of your own notes."] : [];
  if (change.action === "remove") {
    return { notes: notes.filter((n) => n !== target), line: `− ${target.text}`, warnings };
  }
  return {
    notes: notes.map((n) => (n === target ? { ...n, text: change.text, updatedOn: today } : n)),
    line: `~ ${target.text}  →  ${change.text}`,
    warnings,
  };
}

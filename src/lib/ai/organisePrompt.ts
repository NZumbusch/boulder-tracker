import type { AnalyticsCategory, Circuit, CoachNote, ExerciseTypeDef, PhaseDef, TrainingBlock, Workout, WorkoutTemplate } from "../types";
import { exerciseGroup } from "../exercise/library";
import { buildAnalyticsCategorySummaries } from "./context";
import { MAX_COACH_NOTES, MAX_COACH_NOTE_LENGTH } from "./coachNotes";

/**
 * "Organise": the AI tidies the saved data that gets untidy over time - the
 * exercise list (categories, library groups, names, how-tos, ones nobody
 * uses), saved circuits, phases and the coach notes. The athlete picks which
 * areas it may touch; the prompt lists only those, and the reply is an
 * ordinary change set so it goes through the same tickable review as any
 * plan change (`planChanges`) - nothing is applied unseen. Pure; the AI
 * Coach modal gathers the inputs and copies it.
 */

export type OrganiseArea = "exercises" | "circuits" | "phases" | "notes";

export const ORGANISE_AREAS: { id: OrganiseArea; label: string; hint: string }[] = [
  { id: "exercises", label: "Exercises", hint: "Categories, groups, names, how-tos, unused ones" },
  { id: "circuits", label: "Circuits", hint: "Names, descriptions, duplicates" },
  { id: "phases", label: "Phases", hint: "Names, ones nothing uses" },
  { id: "notes", label: "Coach notes", hint: "Merge, trim, remove stale" },
];

export interface OrganisePromptSource {
  exerciseTypes: ExerciseTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  workouts: Workout[];
  circuits?: Circuit[];
  phaseDefs?: PhaseDef[];
  trainingBlocks?: TrainingBlock[];
  templates?: Record<string, WorkoutTemplate[]>;
  coachNotes?: CoachNote[];
}

/** How many completed sessions used each exercise type, by id. */
export function sessionsPerType(workouts: Workout[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of workouts) {
    if (w.status !== "completed") continue;
    for (const typeId of new Set(w.exercises.map((e) => e.typeId))) counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  }
  return counts;
}

/** The date of the latest completed session that used each exercise type, by id. */
export function lastUsedPerType(workouts: Workout[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const w of workouts) {
    if (w.status !== "completed" || !w.date) continue;
    for (const e of w.exercises) if ((last.get(e.typeId) ?? "") < w.date) last.set(e.typeId, w.date);
  }
  return last;
}

/** How many planned sessions (phase templates) include each exercise type, by id. */
function templatesPerType(templates: Record<string, WorkoutTemplate[]>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const list of Object.values(templates)) for (const t of list) for (const typeId of new Set(t.exercises.map((e) => e.typeId))) counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  return counts;
}

const DEFAULT_REQUEST = "make everything in the chosen areas tidy and consistent.";

function exercisesPart(source: OrganisePromptSource) {
  const counts = sessionsPerType(source.workouts);
  const last = lastUsedPerType(source.workouts);
  const inPlans = templatesPerType(source.templates ?? {});
  const categoryUse = new Map<string, number>();
  const active = source.exerciseTypes.filter((t) => !t.archived);
  for (const t of active) categoryUse.set(t.category, (categoryUse.get(t.category) ?? 0) + 1);
  const categories = buildAnalyticsCategorySummaries(source.analyticsCategories)
    .map((c) => JSON.stringify({ name: c.name, exercises: categoryUse.get(c.name) ?? 0 }))
    .join("\n");
  const exercises = active
    .map((t) => JSON.stringify({ name: t.name, category: t.category, group: exerciseGroup(t), sessionsLogged: counts.get(t.id) ?? 0, ...(last.get(t.id) ? { lastLogged: last.get(t.id) } : {}), plannedIn: inPlans.get(t.id) ?? 0, ...(t.description?.trim() ? { howTo: t.description.trim().slice(0, 120) } : {}) }))
    .join("\n");
  return {
    intro: `- EXERCISES: the list I pick from. Analytics categories are the few groups the charts split load and time into (e.g. Fingers, Power Bouldering, Core); each exercise is in exactly one. Library groups are the folders I browse in (e.g. Fingerboard, Stretching) - free text, one level.`,
    shape: `  "categories": [ { "action": "add", "name": "Mobility" }, { "action": "rename", "name": "Other", "rename": "Conditioning" }, { "action": "archive", "name": "Unused category" } ],
  "exerciseTypes": [ { "action": "edit", "name": "Pigeon pose", "categoryName": "Mobility", "group": "Stretching", "rename": "Pigeon stretch", "description": "How to do it." }, { "action": "archive", "name": "Never-used exercise" } ],`,
    rules: `EXERCISES
- "exerciseTypes" entries are only "edit" (with "name" plus any of "categoryName", "group", "rename", "description") or "archive". Spell "name" exactly as listed. Never "add" an exercise, and never change its tracked fields.
- "categoryName" must be an existing category below or one you add under "categories" (applied first). Renaming a category moves its exercises with it. Keep categories few - about 6 to 10; add one only for a distinct kind of training; do not archive one that still has exercises unless you also move them.
- Reuse an existing group name when one fits; prefer few, broad groups over many small ones.
- Rename only to make naming consistent (same style, same words for the same thing, fixing typos); a rename keeps its history. Never merge or delete - if two exercises look like duplicates, rename them apart or mention it in the summary.
- "description" (the how-to): only to tidy or shorten an existing one or add a one-line one where an exercise has none and its name makes the purpose obvious. Do not invent technique details.
- Archive only an exercise with "sessionsLogged": 0 and "plannedIn": 0 (nothing uses it), or one that is clearly a duplicate of another by name. Archived ones stay in my history.
- Leave out an exercise that is already fine. "sessionsLogged" and "lastLogged" show how much I use it - the ones I use a lot matter most.`,
    data: `MY ANALYTICS CATEGORIES (name, how many exercises are in it):\n${categories || "(none)"}\n\nMY EXERCISES (name, category, library group, sessions logged, last logged, planned in how many typical sessions, how-to):\n${exercises || "(none)"}`,
  };
}

function circuitsPart(source: OrganisePromptSource) {
  const types = new Map(source.exerciseTypes.map((t) => [t.id, t.name]));
  const lines = (source.circuits ?? []).map((c) => JSON.stringify({ name: c.name, rounds: c.rounds, ...(c.description?.trim() ? { description: c.description.trim().slice(0, 160) } : {}), exercises: c.exercises.map((e) => types.get(e.typeId) ?? "?") })).join("\n");
  return {
    intro: `- CIRCUITS: my saved circuits and supersets, reused in sessions.`,
    shape: `  "circuits": [ { "action": "edit", "name": "Core A", "rename": "Core circuit A", "description": "What it is for." }, { "action": "delete", "name": "Duplicate circuit" } ],`,
    rules: `CIRCUITS
- Use only "edit" with "name" plus "rename" and/or "description" - do not change a circuit's exercises or timing - or "delete" for an exact duplicate of another circuit (same exercises and timing). Never "add".
- Rename for consistency; give a short description where none exists and its purpose is obvious from its exercises.`,
    data: `MY SAVED CIRCUITS (name, rounds, description, exercises):\n${lines || "(none)"}`,
  };
}

function phasesPart(source: OrganisePromptSource) {
  const blocks = source.trainingBlocks ?? [];
  const templates = source.templates ?? {};
  const lines = (source.phaseDefs ?? [])
    .filter((p) => !p.archived)
    .map((p) => JSON.stringify({ name: p.name, blocks: blocks.filter((b) => b.phaseId === p.id).length, typicalSessions: (templates[p.id] ?? []).length }))
    .join("\n");
  return {
    intro: `- PHASES: the named kinds of training period (e.g. Base, Power, Deload), each with a typical week.`,
    shape: `  "phases": [ { "action": "edit", "name": "Phase 1", "rename": "Base" }, { "action": "delete", "name": "Unused phase" } ],`,
    rules: `PHASES
- Use only "edit" with "name" and "rename", or "delete" for a phase with "blocks": 0 that is empty or a duplicate of another. Do not change a typical week's sessions, and never "add".
- Rename only to make names clear and consistent.`,
    data: `MY PHASES (name, training blocks using it, sessions in its typical week):\n${lines || "(none)"}`,
  };
}

function notesPart(source: OrganisePromptSource) {
  const notes = source.coachNotes ?? [];
  return {
    intro: `- COACH NOTES: the memory every AI reads (at most ${MAX_COACH_NOTES}, each at most ${MAX_COACH_NOTE_LENGTH} characters), id in brackets.`,
    shape: `  "coachNotes": [ { "action": "edit", "id": "k3x9", "text": "Merged, shorter note." }, { "action": "remove", "id": "p2m4" } ],`,
    rules: `COACH NOTES
- Merge notes that overlap (edit one into the combined note, remove the other), shorten wordy ones, remove ones that are out of date or contradict a newer one. Keep what is specific and durable.
- Notes marked "me" are mine: leave them alone unless I asked about them. Never "add" a note - this is tidying, not new coaching.`,
    data: `MY COACH NOTES:\n${notes.map((n) => `[${n.id}] ${n.text} (${n.source === "me" ? "me" : "AI"}, ${n.updatedOn ?? n.addedOn})`).join("\n") || "(none)"}`,
  };
}

export function buildOrganisePrompt(source: OrganisePromptSource, request: string, areas: OrganiseArea[] = ["exercises"]): string {
  const parts = ORGANISE_AREAS.filter((a) => areas.includes(a.id)).map((a) => (a.id === "exercises" ? exercisesPart(source) : a.id === "circuits" ? circuitsPart(source) : a.id === "phases" ? phasesPart(source) : notesPart(source)));
  const what = request.trim() || DEFAULT_REQUEST + (areas.includes("exercises") ? " In particular split any catch-all category (like \"Other\") into real ones, and file every exercise where it belongs." : "");
  return `You are helping me tidy the saved data in a climbing training app. Only these areas, nothing else:
${parts.map((p) => p.intro).join("\n") || "(nothing selected)"}

What I want: ${what}

Respond with ONLY one JSON object - no markdown fences, no text before or after it - a CHANGE SET with these sections (all optional, give only what changes):
{
  "summary": "One short paragraph: what you tidied and why, and anything you noticed but left alone (e.g. suspected duplicates).",
${parts.map((p) => p.shape).join("\n")}
}

RULES
- Touch nothing outside the areas above, and leave out anything already fine. Nothing is applied until I have reviewed and ticked each change.
${parts.map((p) => p.rules).join("\n")}

${parts.map((p) => p.data).join("\n\n")}
`;
}

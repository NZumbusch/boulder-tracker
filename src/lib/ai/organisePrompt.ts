import type { AnalyticsCategory, Benchmark, BenchmarkTypeDef, Circuit, CoachNote, ExerciseTypeDef, GoalEvent, PainIssue, PhaseDef, TrainingBlock, ValueDef, Workout, WorkoutTemplate } from "../types";
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

export type OrganiseArea = "exercises" | "circuits" | "phases" | "notes" | "values" | "tests" | "goals" | "pain";

export const ORGANISE_AREAS: { id: OrganiseArea; label: string; hint: string }[] = [
  { id: "exercises", label: "Exercises", hint: "Categories, groups, names, how-tos, unused ones" },
  { id: "circuits", label: "Circuits", hint: "Names, descriptions, duplicates" },
  { id: "phases", label: "Phases", hint: "Names, ones nothing uses" },
  { id: "notes", label: "Coach notes", hint: "Merge, trim, remove stale" },
  { id: "values", label: "Custom fields", hint: "Names, units, unused ones" },
  { id: "tests", label: "Benchmark tests", hint: "Names, folders, how-to text" },
  { id: "goals", label: "Goals", hint: "Names, notes, ones that are over" },
  { id: "pain", label: "Pain issues", hint: "Names, notes, old open ones" },
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
  valueDefs?: ValueDef[];
  benchmarkTypes?: BenchmarkTypeDef[];
  benchmarks?: Benchmark[];
  goals?: GoalEvent[];
  painIssues?: PainIssue[];
  /** "YYYY-MM-DD" - what "over" and "still open" are measured against. */
  today?: string;
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

function valuesPart(source: OrganisePromptSource) {
  const defs = (source.valueDefs ?? []).filter((v) => !v.archived);
  const lines = defs
    .map((v) => JSON.stringify({
      name: v.name, kind: v.kind, ...(v.unit ? { unit: v.unit } : {}), ...(v.measure ? { measure: v.measure } : {}),
      onExercises: source.exerciseTypes.filter((t) => !t.archived && (t.parameters as string[]).includes(`v:${v.id}`)).length,
      inTests: (source.benchmarkTypes ?? []).filter((b) => !b.archived && b.fields?.some((f) => f.valueId === v.id)).length,
    }))
    .join("\n");
  return {
    intro: `- CUSTOM FIELDS: the extra things I can record on exercises and tests (e.g. "Edge depth", "Hang time").`,
    shape: `  "valueTypes": [ { "action": "edit", "name": "Edge", "rename": "Edge depth", "unit": "mm" }, { "action": "archive", "name": "Unused field" } ],`,
    rules: `CUSTOM FIELDS
- Use only "edit" with "name" plus "rename" and/or "unit" (a plain number's unit - never one with a "measure", which the app converts itself, and never a pick-list), or "archive" for a field with "onExercises": 0 and "inTests": 0. Never add one.
- Rename for clarity and consistency (same style, no abbreviations that mean nothing to me); everything recorded with a field stays.`,
    data: `MY CUSTOM FIELDS (name, kind, unit, how many exercises and tests use it):\n${lines || "(none)"}`,
  };
}

function testsPart(source: OrganisePromptSource) {
  const results = new Map<string, { count: number; last: string }>();
  for (const b of source.benchmarks ?? []) {
    const r = results.get(b.typeId) ?? { count: 0, last: "" };
    results.set(b.typeId, { count: r.count + 1, last: r.last > b.date ? r.last : b.date });
  }
  const lines = (source.benchmarkTypes ?? [])
    .filter((b) => !b.archived)
    .map((b) => JSON.stringify({ name: b.name, ...(b.group ? { folder: b.group } : {}), unit: b.unit, results: results.get(b.id)?.count ?? 0, ...(results.get(b.id)?.last ? { lastResult: results.get(b.id)!.last } : {}), ...(b.protocol?.trim() ? { howTo: b.protocol.trim().slice(0, 140) } : {}) }))
    .join("\n");
  return {
    intro: `- BENCHMARK TESTS: the repeatable tests I log results for (e.g. Max hang, 1RM pull-up), kept in folders.`,
    shape: `  "benchmarkTypes": [ { "action": "edit", "name": "Max hang", "rename": "Max hang 20 mm", "group": "Fingers", "protocol": "Warm up, then 3 attempts, 3 min rest." }, { "action": "archive", "name": "Old test" } ],`,
    rules: `BENCHMARK TESTS
- Use only "edit" with "name" plus "rename", "group" (the folder) and/or "protocol" (how to do it), or "archive" for a test with "results": 0 or one that duplicates another. Never add one or change what it measures.
- Reuse an existing folder name when one fits. Tidy or shorten a how-to; add one only where its name makes the protocol obvious. Results are never touched.`,
    data: `MY BENCHMARK TESTS (name, folder, unit, results logged, last result, how-to):\n${lines || "(none)"}`,
  };
}

function goalsPart(source: OrganisePromptSource) {
  const today = source.today ?? new Date().toISOString().slice(0, 10);
  const lines = (source.goals ?? [])
    .map((g) => JSON.stringify({ name: g.name, kind: g.kind, date: g.date, ...(g.endDate && g.endDate !== g.date ? { endDate: g.endDate } : {}), status: (g.endDate ?? g.date) < today ? "over" : "upcoming", ...(g.notes?.trim() ? { notes: g.notes.trim().slice(0, 140) } : {}) }))
    .join("\n");
  return {
    intro: `- GOALS: my competitions and outdoor trips.`,
    shape: `  "goals": [ { "action": "edit", "name": "Font trip", "date": "2026-11-02", "rename": "Fontainebleau trip", "notes": "Tidier notes." }, { "action": "remove", "name": "Old comp", "date": "2025-03-01" } ],`,
    rules: `GOALS
- Use only "edit" with "name" (plus "date" when two goals share a name) and "rename" and/or "notes", or "remove" - only for a goal with "status": "over" that is clearly just clutter. Never change dates, places or projects, and never add one.
- Tidy wordy or duplicated notes; keep anything that records how it went.`,
    data: `MY GOALS (name, kind, dates, status, notes):\n${lines || "(none)"}`,
  };
}

function painPart(source: OrganisePromptSource) {
  const lines = (source.painIssues ?? [])
    .map((p) => JSON.stringify({ name: p.bodyPart, startDate: p.startDate, ...(p.endDate ? { endDate: p.endDate, ...(p.endEstimated ? { endEstimated: true } : {}) } : { status: "open" }), ...(p.watchCategories?.length ? { watches: p.watchCategories } : {}), ...(p.notes?.trim() ? { notes: p.notes.trim().slice(0, 140) } : {}) }))
    .join("\n");
  return {
    intro: `- PAIN ISSUES: the aches and injuries I track. Health data - be conservative.`,
    shape: `  "painIssues": [ { "action": "edit", "name": "Finger", "startDate": "2026-05-01", "rename": "Left ring finger A2", "notes": "Tidier notes." }, { "action": "resolve", "name": "Elbow", "endDate": "2026-08-10" } ],`,
    rules: `PAIN ISSUES
- Use only "edit" (with "name", "startDate" when a name recurs, and "rename", "notes" and/or "watchCategories" - existing analytics category names) or "resolve" with an "endDate" (not in the future) for an "open" issue that my notes show is over. If it is unclear whether an issue is over, leave it and mention it in the summary - never guess. Never add or delete one.
- Make names consistent (body part, side, detail) and notes concise without losing what happened.`,
    data: `MY PAIN ISSUES (name, start, end or open, watched categories, notes):\n${lines || "(none)"}`,
  };
}

export function buildOrganisePrompt(source: OrganisePromptSource, request: string, areas: OrganiseArea[] = ["exercises"]): string {
  const parts = ORGANISE_AREAS.filter((a) => areas.includes(a.id)).map((a) => ({ exercises: exercisesPart, circuits: circuitsPart, phases: phasesPart, notes: notesPart, values: valuesPart, tests: testsPart, goals: goalsPart, pain: painPart })[a.id](source));
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

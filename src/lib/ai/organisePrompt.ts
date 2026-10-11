import type { AnalyticsCategory, ExerciseTypeDef, Workout } from "../types";
import { exerciseGroup } from "../exercise/library";
import { buildAnalyticsCategorySummaries } from "./context";

/**
 * "Organise my exercises": the AI regroups the exercise list - new analytics
 * categories (splitting a catch-all like "Other"), and which category and
 * library group each exercise belongs to. The reply is an ordinary change set
 * restricted to "categories" and "exerciseTypes" edits, so it goes through the
 * same tickable review as any plan change (`planChanges`) - nothing is applied
 * unseen. Pure; the AI Coach modal gathers the inputs and copies it.
 */

export interface OrganisePromptSource {
  exerciseTypes: ExerciseTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  workouts: Workout[];
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

export function buildOrganisePrompt(source: OrganisePromptSource, request: string): string {
  const counts = sessionsPerType(source.workouts);
  const categoryUse = new Map<string, number>();
  const active = source.exerciseTypes.filter((t) => !t.archived);
  for (const t of active) categoryUse.set(t.category, (categoryUse.get(t.category) ?? 0) + 1);

  const categories = buildAnalyticsCategorySummaries(source.analyticsCategories)
    .map((c) => JSON.stringify({ name: c.name, exercises: categoryUse.get(c.name) ?? 0 }))
    .join("\n");
  const exercises = active
    .map((t) => JSON.stringify({ name: t.name, category: t.category, group: exerciseGroup(t), sessionsLogged: counts.get(t.id) ?? 0, ...(t.description?.trim() ? { howTo: t.description.trim().slice(0, 120) } : {}) }))
    .join("\n");

  return `You are helping me tidy my exercise library in a climbing training app. Two things organise it:
- ANALYTICS CATEGORIES: the few groups the charts split training load and time into (e.g. Fingers, Power Bouldering, Core). Each exercise is in exactly one.
- LIBRARY GROUPS: the folders I browse exercises in (e.g. Fingerboard, Stretching, Strength). Free-text names, one level.

What I want: ${request.trim() || "make the categories and groups sensible - in particular split any catch-all category (like \"Other\") into real ones, and file every exercise where it belongs."}

Respond with ONLY one JSON object - no markdown fences, no text before or after it - a CHANGE SET with these sections (both optional):
{
  "summary": "One short paragraph: what you reorganised and why.",
  "categories": [ { "action": "add", "name": "Mobility" }, { "action": "rename", "name": "Other", "rename": "Conditioning" }, { "action": "archive", "name": "Unused category" } ],
  "exerciseTypes": [ { "action": "edit", "name": "Pigeon pose", "categoryName": "Mobility", "group": "Stretching" } ]
}

RULES
- In "exerciseTypes" use ONLY "edit" entries with "name" plus "categoryName" and/or "group". Spell "name" exactly as listed. Do not rename, archive, add or change anything else about an exercise.
- "categoryName" must be an existing category below or one you add under "categories" (applied first). Renaming a category moves its exercises with it.
- Keep the number of categories small - about 6 to 10. Add one only for a distinct kind of training that no existing category fits; never one per exercise. Do not archive a category that still has exercises unless you also move them.
- Reuse an existing group name when one fits; start a new group only for a genuinely new kind of exercise. Prefer few, broad groups over many small ones.
- Leave an exercise out if it is already where it belongs. Give only what changes.
- "sessionsLogged" is how many sessions I have logged with it - an exercise I use a lot matters more than one I never touched.

MY ANALYTICS CATEGORIES (name, how many exercises are in it):
${categories || "(none)"}

MY EXERCISES (name, category, library group, sessions logged):
${exercises || "(none)"}
`;
}

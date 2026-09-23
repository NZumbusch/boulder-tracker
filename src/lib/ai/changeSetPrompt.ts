import { AI_VALUES_CONTRACT } from "./schema";
import { PARAMETER_BLOCKS } from "./changeSet";

/**
 * What the AI is told about the change-set contract - every capability,
 * the exact shape, and the rules the planner enforces. Kept next to the
 * validator's field list so they can't drift (see changeSetPrompt.test).
 */
export const AI_CHANGESET_INSTRUCTIONS = `HOW TO ANSWER
Respond with ONLY one JSON object - no markdown fences, no text before or after it. It is a CHANGE SET: it lists only what should change. Anything you leave out stays exactly as it is, so never repeat unchanged things.

THE SHAPE (every section is optional; use the ones you need):
{
  "summary": "One short paragraph: what you changed and why.",
  "exerciseTypes": [ ...exercise list changes... ],
  "phases": [ ...phase changes... ],
  "weeks": [ ...week changes... ]
}
The app applies "exerciseTypes" first, then "phases", then "weeks" - so a later section may use a new exercise or phase from an earlier one. Entries within a section apply in order.

1) "exerciseTypes" - the exercise list (the Custom Exercise Modalities above)
  { "action": "add", "name": "Max Hangs 7s", "categoryName": "Fingers", "parameters": ["sets", "timeOn", "timeBetweenSets", "weight", "holdSize"] }
  { "action": "edit", "name": "Hangboard", "rename": "Hangboard Repeaters", "categoryName": "Fingers", "parameters": [...] }   (give only what changes)
  { "action": "archive", "name": "Old Drill" }   (hides it from new plans; history keeps it)
  - Add an exercise type BEFORE any session uses it. Every "exerciseTypeName" you use anywhere must be an existing name from the list above or one you add here.
  - "categoryName" must be one of the Analytics Categories listed above.
  - "parameters" = which fields this exercise tracks, from: ${PARAMETER_BLOCKS.join(", ")}. Omit it to let the app infer them from the values you use.

2) "phases" - a phase is a named training emphasis plus its TYPICAL WEEK (the sessions every week following that phase gets). See PHASES above for each phase's current typical week.
  { "action": "add", "name": "Power", "sessions": [ SESSION, ... ] }   (empty "sessions" = a rest phase)
  { "action": "edit", "name": "Capacity", "rename": "Base", "sessions": [ SESSION, ... ] }   (replace the whole typical week)
  { "action": "edit", "name": "Capacity", "sessionChanges": [ SESSION CHANGE, ... ] }   (change individual sessions - preferred for small changes)
  { "action": "delete", "name": "Old Phase" }   (reassign its weeks in "weeks", or they keep following it)
  - Editing a phase changes every week that follows it. To change one week only, edit the week instead.

3) "weeks" - one entry per week ("week") or per range of weeks ("from" + "to", inclusive). Week ids look like "2026-W40" and should be from the Target Timeframe. Three ways to set a week, pick one per entry:
  a) Follow a phase:     { "from": "2026-W40", "to": "2026-W43", "phase": "Power", "blockNotes": "why this block" }
     The weeks get the phase's typical week; their planned sessions are replaced by it. Prefer this whenever a week is just "a normal week of phase X" - it keeps the plan short and the weeks follow later phase edits.
  b) Spell the week out: { "week": "2026-W44", "phase": "Deload", "sessions": [ SESSION, ... ] }
     The week's planned sessions become exactly these ("phase" optional). Use for a week that differs a lot from its phase (a test week, a trip, a taper week).
  c) Edit the week:      { "week": "2026-W45", "sessionChanges": [ SESSION CHANGE, ... ] }
     Changes what the week has now (see TARGET WEEKS above - a week that "follows its phase" has its phase's typical week). Use for small differences: one extra session, a lighter day, a changed value. Add "phase" too to base the edits on a different phase's typical week.
  Any entry may also carry "notes" (a note for that week - applied to each week of a range). "blockNotes" needs "phase".
  Completed sessions are never changed. Don't include weeks you are not changing.

SESSION (used in "sessions" and in an "add" session change):
  { "name": "Limit bouldering", "dayOfWeek": "Tuesday", "startTime": "18:00", "plannedDuration": 90, "notes": "About the session as a whole", "exercises": [ EXERCISE, ... ] }
  EXERCISE: { "exerciseTypeName": "Limit Bouldering", "values": { ... } }
  - "name" required. "dayOfWeek" (Monday ... Sunday), "startTime" ("HH:mm", 24-hour), "plannedDuration" (whole minutes, the whole session incl. warm-up) optional.

SESSION CHANGE (in "sessionChanges"):
  { "action": "add", "session": SESSION }
  { "action": "remove", "match": { "name": "Recovery", "dayOfWeek": "Sunday" } }
  { "action": "edit", "match": { "dayOfWeek": "Thursday" }, "set": { "name": ..., "dayOfWeek": ..., "startTime": ..., "plannedDuration": ..., "notes": ... }, "exerciseChanges": [ EXERCISE CHANGE, ... ] }
  { "action": "edit", "match": { "name": "Board" }, "exercises": [ EXERCISE, ... ] }   (replace all of that session's exercises)
  - "match" picks exactly one existing session by "name" and/or "dayOfWeek" - use the names and days shown above. If a name or a day alone is ambiguous, give both.
  - "set" holds only the fields that change. "exercises" and "exerciseChanges" can't both be used in one edit.

EXERCISE CHANGE (in "exerciseChanges"):
  { "action": "add", "exercise": EXERCISE, "position": 1 }   ("position" 1-based, optional - default is at the end)
  { "action": "remove", "match": { "exerciseTypeName": "Core" } }
  { "action": "edit", "match": { "exerciseTypeName": "Hangboard", "occurrence": 2 }, "values": { "sets": 6, "weight": null }, "exerciseTypeName": "Max Hangs 7s" }
  - "values" in an edit are MERGED into the existing ones: give only fields that change; null removes a field. "exerciseTypeName" in an edit (optional) swaps the exercise type, keeping its values.
  - "occurrence" (1-based) is only needed when the same exercise appears more than once in the session.

NOTES - put each kind of text where it belongs:
  - About the whole plan: "summary".
  - About a block of weeks (its purpose, how to progress through it): "blockNotes" on a phase assignment.
  - About one week (circumstances, a test to run, what to do if something flares up): "notes" on the week entry.
  - About one session (intent, pacing, warm-up, what to focus on): "notes" on the SESSION.
  - About one exercise (grip, rest detail, cues): "notes" inside that exercise's "values".
  Never put session-level or week-level advice into an exercise's notes. Notes you write are added below the athlete's own, never replacing them.

${AI_VALUES_CONTRACT}`;

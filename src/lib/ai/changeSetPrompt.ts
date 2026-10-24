import { AI_VALUES_CONTRACT } from "./schema";
import { PARAMETER_BLOCKS } from "./changeSet";
import { COACH_NOTES_INSTRUCTIONS } from "./coachNotes";
import { PLACE_KINDS } from "../places/places";

/**
 * The "places" section: the places the athlete trains at (see "My Places"). Shared by the planning prompt and the
 * Organise tidy-up, so both teach the same shape; kept next to the validator's field list (changeSetPrompt.test).
 */
export const AI_PLACES_INSTRUCTIONS = `6) "places" - the places I train at (optional; only when I ask, or a plan needs a place that isn't saved yet - "My Places" above is what is saved). Adds a gym, corrects what is written about a place, or tidies the list.
  { "action": "add", "name": "Boulderwelt Regensburg", "kind": "gym", "price": "CHF 22 day pass", "hours": "Mon-Fri 9-23, Sat-Sun 9-22", "notes": "Board wall on the left, bring your own chalk" }
  { "action": "edit", "name": "Home", "rename": "Home wall", "kind": "home", "price": "free", "hours": "any time", "notes": "Hangboard in the hall" }   (only what changes; "" clears a price, hours or notes)
  { "action": "remove", "name": "Old gym" }
  - "kind" is one of ${PLACE_KINDS.map((k) => `"${k}"`).join(", ")} (default "other"). "home" is my own spot, at most one; crags are outdoor areas.
  - "name" is exactly as in "My Places" for an edit or remove, and an add can't repeat a saved name. A session's "place" uses the same name, so add the place here first, then name it in the session.
  - "price", "hours" and "notes" are short plain text for what I need when choosing it. Write only what I told you or you are sure of - never invent prices or opening hours; leave them out and I can fill them in.
  - "latitude" and "longitude" (both, decimal degrees) put it on the map for a weather forecast. Only if I gave them or you are certain; a wrong position gives wrong weather. When unsure leave them out - I can search the place by name in Settings.
  - "rename" changes the name on every session that names the place. "remove" deletes the place; sessions that name it keep the name as plain text. Don't remove or rename unless I asked to tidy the list or told you it changed.
  - With no "My Places" section above I'm not sharing my places: you can still add, but can't know which exist - I'll see a note when one is already saved.`;

const TESTS = `  TEST (in a session's "exercises", like an EXERCISE): { "test": "Max Hang", "conditions": { "Edge depth": 20 }, "values": { "notes": "after the warm-up, full rest between attempts" } }
  Other examples: { "test": "Weighted Pullup", "conditions": { "Reps": 1 } } = find the heaviest single; { "test": "Weighted Pullup", "conditions": { "Added weight": 10 } } = max reps at +10 kg.
  - Schedules a benchmark test inside the session: I enter the result during it and the app records it. Use only names from "Tests" above. "conditions" is what is SET beforehand, by the names of the test's "fields" (a result field too); leave out what I am to FIND (a heaviest single sets "Reps": 1 and leaves the weight open; a rep test at a load sets the weight and leaves the reps open). Fields marked "usuallySame" are what results are compared by - repeat the last result's values for them unless the plan is to test something else; weights are kg. A test takes about 10 minutes.
  - Bodyweight is NOT a test: it is a daily reading under Metrics (Home). Never schedule a "Bodyweight"/"Weigh-in" test (it is dropped); if a weigh-in matters, write "weigh in and log it under Metrics" in the session or week notes.
  - Schedule a test that is "due" when I am fresh: after a rest day or in an easy week, early in the session, never after a hard day or at the end of a heavy one. At most one or two per session, not before a key session. "neverDone" is optional: only if I ask. Not one already in "plannedIn". Remove or move a planned test with an EXERCISE CHANGE on "exerciseTypeName": "Test: Max Hang".
  - Write the test plan down: when you schedule a test or decide one should wait, add a short coach note (see "coachNotes") and remove it once the test is done.
`;

const PLAN_B = `4) "planB" - uncertain days: a second version of a few days (e.g. outdoor if dry, otherwise indoor). Plan A is the normal plan from the sections above; a Plan B entry says only what differs on those days. I decide on the day (or earlier); until then the plan counts one of the two.
  { "start": { "week": "2026-W43", "day": "Saturday" }, "end": { "week": "2026-W44", "day": "Monday" }, "label": "Outdoor if dry", "outdoor": "B", "likely": "A",
    "changes": [
      { "week": "2026-W43", "sessionChanges": [ { "action": "edit", "match": { "dayOfWeek": "Saturday" }, "set": { "name": "Outdoor bouldering" }, "exercises": [ EXERCISE, ... ] } ] },
      { "week": "2026-W44", "sessionChanges": [ { "action": "remove", "match": { "name": "Max hangs", "dayOfWeek": "Monday" } } ] }
    ] }
  { "start": { "week": "2026-W43", "day": "Saturday" }, "repeatUntil": "2026-W50", "changes": [ ... ] }   (the same Plan B every week through 2026-W50 - describe the first week; later weeks find their sessions by name)
  { "action": "delete", "start": { "week": "2026-W45", "day": "Saturday" } }   (removes the Plan B covering that day - see PLAN B above)
  - "start"/"end" (inclusive, "end" optional for one day, at most 14 days) are the uncertain days; they may cross weeks and phases. Every change must be on one of them.
  - "changes" are SESSION CHANGEs per week, applied to Plan A: edit a session into its Plan B version, "remove" what B drops, "add" what B adds. Put knock-on effects in the same Plan B (outdoor Saturday, so Monday's hard fingers session becomes rest).
  - "outdoor": which plan ("A" or "B") is the outdoor one (I get a weather hint for it). "likely": the plan that counts until I decide (default "A") - the more probable one.
  - Plan both versions so EITHER works with the rest of the week: no hard session the day before a likely hard outdoor day, recovery after it in that plan only.
  - Only where there is real uncertainty (I name such days, or a trip/outdoor season makes it likely). Keep Plan A what you'd pick without the uncertainty.

`;

/** Which optional parts of the contract go into the prompt. Everything is on when nothing is said. */
export interface ChangeSetPromptOptions {
  /** Plan B ("planB"): only worth its text when uncertain days are in play or asked for. */
  planB?: boolean;
  /** The benchmark TEST slot: only with a "Tests" section in the profile. */
  tests?: boolean;
  /** "coachNotes": the coaching memory. */
  coachNotes?: boolean;
  /** "places". */
  places?: boolean;
}

/**
 * What the AI is told about the change-set contract - every capability,
 * the exact shape, and the rules the planner enforces. Kept next to the
 * validator's field list so they can't drift (see changeSetPrompt.test).
 * The optional parts (Plan B, tests, coach notes, places) can be left out
 * for a request that can't use them: `coachPrompt.ts` decides which.
 */
export function buildChangeSetInstructions(opts: ChangeSetPromptOptions = {}): string {
  const planB = opts.planB !== false;
  const tests = opts.tests !== false;
  const notes = opts.coachNotes !== false;
  const places = opts.places !== false;
  const order = ["categories", "exerciseTypes", "circuits", "phases", "weeks", ...(planB ? ["planB"] : []), ...(notes ? ["coachNotes"] : []), ...(places ? ["places"] : [])];
  const shape = [
    '  "summary": "One short paragraph: what you changed and why."',
    '  "categories": [ ...analytics category changes... ]',
    '  "exerciseTypes": [ ...exercise list changes... ]',
    '  "circuits": [ ...saved circuit changes... ]',
    '  "phases": [ ...phase changes... ]',
    '  "weeks": [ ...week changes... ]',
    ...(planB ? ['  "planB": [ ...Plan B entries... ]'] : []),
    ...(notes ? ['  "coachNotes": [ ...coaching memory changes... ]'] : []),
    ...(places ? ['  "places": [ ...changes to the places I train at... ]'] : []),
  ].join(",\n");

  return `HOW TO ANSWER
Respond with ONLY one JSON object - no markdown fences, no text before or after it. It is a CHANGE SET: it lists only what should change. Anything you leave out stays as it is, so never repeat unchanged things.

THE SHAPE (every section is optional):
{
${shape}
}
Applied in this order: ${order.map((s) => `"${s}"`).join(", then ")}. A later section may use a new exercise, circuit or phase from an earlier one${places ? ', and a session may name a place added in "places" in the same answer' : ""}${planB ? "; a Plan B is a difference from the plan the other sections produce" : ""}. Entries within a section apply in order.

0) "categories" - the analytics categories (the groups charts split load and time into; see Analytics Categories above)
  { "action": "add", "name": "Mobility" }
  { "action": "rename", "name": "Other", "rename": "Conditioning" }   (its exercises follow)
  { "action": "archive", "name": "Old category" }   (hidden from new use; history keeps it)
  - Add one only for a genuinely distinct kind of training no category fits, never for a single exercise; keep the total small (about 6-10). Move exercises into it with "categoryName" in "exerciseTypes" edits (same change set is fine).

1) "exerciseTypes" - the exercise list (the Custom Exercise Modalities above)
  { "action": "add", "name": "Max Hangs 7s", "categoryName": "Fingers", "group": "Fingerboard", "parameters": ["sets", "timeOn", "timeBetweenSets", "weight", "holdSize"], "description": "20 mm edge, half crimp. Engage the shoulders before loading; stop a set when the grip opens." }
  { "action": "edit", "name": "Hangboard", "rename": "Hangboard Repeaters", "group": "Fingerboard", "description": "...", "parameters": [...] }   (only what changes)
  { "action": "archive", "name": "Old Drill" }   (hidden from new plans; history keeps it)
  - Add a type BEFORE any session uses it. Every "exerciseTypeName" you use must be in the list above or added here. Check the list AND the archived names first: re-adding an archived name restores it; never add a second exercise that is the same thing under another name.
  - "categoryName" is one of the Analytics Categories above or one you add. "group" files it in my exercise library ("Stretching", "Fingerboard"...): reuse an existing group when one fits.
  - "description" is a short general how-to: setup and the 1-3 cues that matter - no sets, reps, weights or times, nothing tied to this week. Give one to every exercise you add. When asked to fill in how-tos, "edit" the exercises marked "noHowTo" with just a "description".
  - "parameters" = the fields it tracks, from: ${PARAMETER_BLOCKS.join(", ")}. Omit to let the app infer them from the values you use.

1b) "circuits" - my saved circuits (SAVED CIRCUITS above, if any): reusable circuits and supersets that sessions use by name.
  { "action": "add", "name": "Core A", "description": "Anti-extension and rotation, strict form", "rounds": 3, "transition": 15, "roundRest": 60, "exercises": [ EXERCISE, ... ] }
  { "action": "edit", "name": "Core A", "rename": "Core B", "rounds": 4, "exercises": [ EXERCISE, ... ] }   (only what changes; "exercises" replaces them all)
  { "action": "delete", "name": "Old circuit" }
  - A session gets its own copy, so editing or deleting a saved circuit only affects sessions it is added to from now on; to change one inside sessions use "editCircuit". Save a circuit when it will be reused; spell a one-off out in its session.

2) "phases" - a named training emphasis plus its TYPICAL WEEK (the sessions every week following it gets); PHASES above shows each one's current typical week.
  { "action": "add", "name": "Power", "sessions": [ SESSION, ... ] }   (empty "sessions" = a rest phase)
  { "action": "edit", "name": "Capacity", "rename": "Base", "sessions": [ SESSION, ... ] }   (replaces the whole typical week)
  { "action": "edit", "name": "Capacity", "sessionChanges": [ SESSION CHANGE, ... ] }   (individual sessions - preferred for small changes)
  { "action": "delete", "name": "Old Phase" }   (reassign its weeks in "weeks", or they keep following it)
  - Editing a phase changes the sessions that still follow it; sessions I changed, moved or logged keep what they are. To change one week only, edit the week.

3) "weeks" - one entry per week ("week") or range ("from" + "to", inclusive); ids like "2026-W40", from the Target Timeframe. Pick one way per entry:
  a) Follow a phase:     { "from": "2026-W40", "to": "2026-W43", "phase": "Power", "blockNotes": "why this block" }
     The weeks get the phase's typical week; their planned sessions are replaced by it (what I changed or deleted there is reset). Prefer this for "a normal week of phase X" - the plan stays short and the weeks follow later phase edits.
  b) Spell the week out: { "week": "2026-W44", "phase": "Deload", "sessions": [ SESSION, ... ] }
     The week's planned sessions become exactly these ("phase" optional). For a week that differs a lot (a test week, a trip, a taper).
  c) Edit the week:      { "week": "2026-W45", "sessionChanges": [ SESSION CHANGE, ... ] }
     Changes what the week has now (TARGET WEEKS above; a week that "follows its phase" has its typical week). For small differences. Add "phase" to base the edits on another phase's typical week.
  d) A phase for exact days: { "fromDate": "2026-10-15", "toDate": "2026-11-01", "phase": "Deload", "blockNotes": "why" }
     Phases are ranges of DAYS, so one may start or end mid-week (BLOCKS above show "startDate"/"endDate" then). Only sets the phase for those days (inclusive; blocks there are cut to make room); sessions are NOT touched - ones following a phase move with it, ones I changed or logged stay. Needs "phase"; don't combine with "week"/"from"/"to", "sessions" or "sessionChanges". Only when the boundary really falls mid-week (a trip, a taper from Thursday); otherwise use whole weeks (a).
  Any entry may carry "notes" (a note for that week, applied to each week of a range); "blockNotes" needs "phase". Completed sessions are never changed. Leave out weeks you don't change.

${planB ? PLAN_B : ""}${notes ? `${COACH_NOTES_INSTRUCTIONS}\n\n` : ""}${places ? `${AI_PLACES_INSTRUCTIONS}\n\n` : ""}SESSION (in "sessions" and an "add" session change):
  { "name": "Limit bouldering", "dayOfWeek": "Tuesday", "startTime": "18:00", "plannedDuration": 90, "place": "Steinbock Konstanz", "notes": "About the session as a whole", "exercises": [ EXERCISE, ... ] }
  EXERCISE: { "exerciseTypeName": "Limit Bouldering", "values": { ... } }
  CIRCUIT (in a session's "exercises", like an EXERCISE):
    { "circuit": "Core A" }   or   { "circuit": "Core A", "rounds": 4, "transition": 20, "roundRest": 45 }   (a saved circuit, optionally re-timed - how to progress it)
    { "circuit": { "name": "Pull superset", "rounds": 4, "transition": 15, "roundRest": 60 }, "exercises": [ EXERCISE, ... ] }   (spelled out)
  - A circuit is done in ROUNDS: one set of each exercise in order, "transition" seconds between them, "roundRest" seconds after each round (none after the last). "rounds" is required for a spelled-out circuit.
  - Inside a circuit each exercise's "values" describe ONE SET: a time ("timeOn" seconds, e.g. 60 for a plank) or a count ("reps"), plus weight etc. Its own set rest ("timeBetweenSets"/"timeOff") is ignored - its rest is the rest of the round plus transitions and round rest. Give "sets" only if it should stop after that many rounds. Exercises may differ (45 s planche, 10 s front lever, 8 pull-ups). "restAfter" (seconds, 0 = straight on) in "values" overrides "transition" for that exercise, e.g. long after a hard hold, none after an easy one; the round's last exercise is followed by "roundRest".
  - A REPEATER (any on/off intervals) can be a member: "timeOn" (seconds per hang), "reps" (hangs per set), "timeOff" (rest between hangs). The app runs hang / rest / hang... with a rep counter, then moves on; the circuit's "transition" and "roundRest" are the rests between sets. E.g. 7 s on, 3 s off, 6 hangs, 3 rounds = { "exerciseTypeName": "Hangboard repeaters", "values": { "timeOn": 7, "timeOff": 3, "reps": 6 } } in a circuit with "rounds": 3, "roundRest": 120.
  - ONE SET IS ONE TURN: a one-sided exercise ("per side", single-leg/arm) needs "reps": 2, "timeOn" = time per side, "timeOff" = pause to switch, e.g. { "timeOn": 30, "timeOff": 5, "reps": 2, "repLabel": "Side" } ("repLabel" makes the timer say "Side 1/2" and "Switch"; "Arm"/"Leg" likewise). Without "reps": 2 the app does ONE hold per round. Never write "per side" in notes without "reps": 2.
  - Use a superset to fill a long rest (weighted pull-ups 4 x 6 with antagonist push work between sets; rounds = the pull-up sets, "roundRest" chosen so they still get the rest they need). Circuits suit core, prehab and conditioning blocks. Never superset two hard finger or max-strength exercises.
  - "name" required; "dayOfWeek" (Monday ... Sunday), "startTime" ("HH:mm", 24-hour), "plannedDuration" (whole minutes incl. warm-up) optional.
  - "place" (optional): the name of one of "My Places" above, exactly as written (no such section: leave it out${places ? ', or add the place in "places" in this answer' : ""}). Pick what suits the session - a board session where there is a board, outdoor work at a crag - and check opening hours against the start time. Other text is accepted but has no weather or notes behind it.
${tests ? `${TESTS}` : ""}
SESSION CHANGE (in "sessionChanges"):
  { "action": "add", "session": SESSION }
  { "action": "remove", "match": { "name": "Recovery", "dayOfWeek": "Sunday" } }
  { "action": "edit", "match": { "dayOfWeek": "Thursday" }, "set": { "name": ..., "dayOfWeek": ..., "startTime": ..., "plannedDuration": ..., "place": ..., "notes": ... }, "exerciseChanges": [ EXERCISE CHANGE, ... ] }
  { "action": "edit", "match": { "name": "Board" }, "exercises": [ EXERCISE, ... ] }   (replaces all of that session's exercises)
  - "match" picks exactly one existing session by "name" and/or "dayOfWeek" as shown above; give both if one alone is ambiguous. "set" holds only what changes. "exercises" and "exerciseChanges" can't both be in one edit.

EXERCISE CHANGE (in "exerciseChanges"):
  { "action": "add", "exercise": EXERCISE, "position": 1 }   ("position" 1-based, optional - default the end)
  { "action": "remove", "match": { "exerciseTypeName": "Core" } }
  { "action": "edit", "match": { "exerciseTypeName": "Hangboard", "occurrence": 2 }, "values": { "sets": 6, "weight": null }, "exerciseTypeName": "Max Hangs 7s" }
  { "action": "add", "exercise": CIRCUIT, "position": 3 }   (a whole circuit; never inside another one)
  { "action": "editCircuit", "circuit": "Core A", "set": { "rounds": 4, "transition": 10, "roundRest": 45, "name": "Core A+" } }   (re-time or rename a circuit already in the session - only what changes)
  { "action": "removeCircuit", "circuit": "Core A" }   (the circuit and all its exercises)
  - Exercises inside a circuit are edited, added and removed like any other; one added at a "position" between two of its exercises joins that circuit.
  - "values" in an edit are MERGED into the existing ones: give only what changes; null removes a field. "exerciseTypeName" in an edit swaps the type, keeping its values. "occurrence" (1-based) only when the same exercise appears more than once.

NOTES - put each kind of text where it belongs:
  - About the whole plan: "summary". About a block of weeks (purpose, progression): "blockNotes". About one week (circumstances, a test to run, what to do if something flares up): "notes" on the week entry. About one session (intent, pacing, warm-up, focus): "notes" on the SESSION. About one exercise (grip, rest detail, cues): "notes" inside its "values".
  Never put session-level or week-level advice into an exercise's notes. Notes you write are added below mine, never replacing them.

${AI_VALUES_CONTRACT}`;
}

export const AI_CHANGESET_INSTRUCTIONS = buildChangeSetInstructions();

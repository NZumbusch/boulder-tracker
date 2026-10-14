import { AI_VALUES_CONTRACT } from "./schema";
import { PARAMETER_BLOCKS } from "./changeSet";
import { COACH_NOTES_INSTRUCTIONS } from "./coachNotes";
import { PLACE_KINDS } from "../places/places";

/**
 * The "places" section: the places the athlete trains at (see "My Places"). Shared by the planning prompt and the
 * Organise tidy-up, so both teach the same shape; kept next to the validator's field list (changeSetPrompt.test).
 */
export const AI_PLACES_INSTRUCTIONS = `6) "places" - the places I train at (optional; only when I ask for it, or when a plan needs a place that isn't saved yet - see "My Places" above for what is saved now). This is how you add a new gym, correct what is written about a place, or tidy the list.
  { "action": "add", "name": "Boulderwelt Regensburg", "kind": "gym", "price": "CHF 22 day pass", "hours": "Mon-Fri 9-23, Sat-Sun 9-22", "notes": "Board wall on the left, bring your own chalk" }
  { "action": "edit", "name": "Home", "rename": "Home wall", "kind": "home", "price": "free", "hours": "any time", "notes": "Hangboard in the hall" }   (give only what changes; "" clears a price, hours or notes)
  { "action": "remove", "name": "Old gym" }
  - "kind" is one of ${PLACE_KINDS.map((k) => `"${k}"`).join(", ")} (default "other"). "home" is my own training spot and there is at most one; crags are outdoor areas.
  - "name" is how the place is found - exactly as written in "My Places" for an edit or remove, and it can't repeat a saved name (to change a place, use "edit"). A session's "place" uses the same name, so add the place here first (in this answer) and then name it in the session.
  - "price", "hours" and "notes" are short plain text for what I should know when choosing it ("CHF 22 day pass", "Tue closed", "the top-out is slippery when wet"). Only write what I told you or you are sure of - never invent prices or opening hours; leave them out instead and I can fill them in. Keep notes brief.
  - "latitude" and "longitude" (both, decimal degrees) put the place on the map so it gets a weather forecast. Give them only if I gave them or you are certain; a wrong position gives wrong weather and I can't see it at a glance. When unsure, leave them out - I can search the place by name in Settings.
  - "rename" changes the name everywhere: the sessions that name the place follow it. "remove" deletes the place; sessions that name it keep the name as plain text. Don't remove or rename a place unless I asked you to tidy the list or told you it changed.
  - If there is no "My Places" section above, I'm not sharing my places with you: you can still add, but you can't know which exist - I'll see a note when one is already saved.`;

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
  "categories": [ ...analytics category changes... ],
  "exerciseTypes": [ ...exercise list changes... ],
  "circuits": [ ...saved circuit changes... ],
  "phases": [ ...phase changes... ],
  "weeks": [ ...week changes... ],
  "planB": [ ...Plan B entries... ],
  "coachNotes": [ ...coaching memory changes... ],
  "places": [ ...changes to the places I train at... ]
}
The app applies "categories" first, then "exerciseTypes", then "circuits", then "phases", then "weeks", then "planB", then "coachNotes", then "places" - a session may name a place added in "places" in the same answer; and a later section may use a new exercise, circuit or phase from an earlier one, and a Plan B is a difference from the plan the other sections produce. Entries within a section apply in order.

0) "categories" - the analytics categories (the groups that charts split training load and time into; see Analytics Categories above)
  { "action": "add", "name": "Mobility" }
  { "action": "rename", "name": "Other", "rename": "Conditioning" }   (exercises in it follow the new name)
  { "action": "archive", "name": "Old category" }   (hides it from new use; history keeps it)
  - Add a category only for a genuinely distinct kind of training that no existing category fits, and keep the total small (about 6-10): charts get unreadable with more. Never add one for a single exercise.
  - Then move exercises into it with "categoryName" in "exerciseTypes" edits. A category you add here may be used by "categoryName" in the same change set.

1) "exerciseTypes" - the exercise list (the Custom Exercise Modalities above)
  { "action": "add", "name": "Max Hangs 7s", "categoryName": "Fingers", "group": "Fingerboard", "parameters": ["sets", "timeOn", "timeBetweenSets", "weight", "holdSize"], "description": "20 mm edge, half crimp. Engage the shoulders before loading; stop a set when the grip opens." }
  { "action": "edit", "name": "Hangboard", "rename": "Hangboard Repeaters", "group": "Fingerboard", "description": "...", "parameters": [...] }   (give only what changes)
  { "action": "archive", "name": "Old Drill" }   (hides it from new plans; history keeps it)
  - Add an exercise type BEFORE any session uses it. Every "exerciseTypeName" you use anywhere must be an existing name from the list above or one you add here.
  - "categoryName" must be one of the Analytics Categories listed above, or one you add under "categories".
  - "group" files it in the athlete's exercise library (e.g. "Stretching", "Fingerboard", "Strength"). Reuse an existing group from the list when one fits; start a new one only for a genuinely new kind of exercise.
  - "description" is a short, general how-to: setup and the 1-3 cues that matter. Keep it general - no sets, reps, weights or times (those belong in each session), nothing tied to this week. Give one to every exercise you add. When asked to fill in or improve how-tos, "edit" the exercises marked "noHowTo" with just a "description".
  - Before adding, check the list AND the archived names: re-adding an archived exercise by its exact name restores it; never add a second exercise that is the same thing under another name.
  - "parameters" = which fields this exercise tracks, from: ${PARAMETER_BLOCKS.join(", ")}. Omit it to let the app infer them from the values you use.

1b) "circuits" - the athlete's saved circuits (see SAVED CIRCUITS above, if any): reusable circuits and supersets that sessions use by name.
  { "action": "add", "name": "Core A", "description": "Anti-extension and rotation, strict form", "rounds": 3, "transition": 15, "roundRest": 60, "exercises": [ EXERCISE, ... ] }
  { "action": "edit", "name": "Core A", "rename": "Core B", "rounds": 4, "exercises": [ EXERCISE, ... ] }   (give only what changes; "exercises" replaces them all)
  { "action": "delete", "name": "Old circuit" }
  - A session that uses a circuit gets its own copy, so editing or deleting a saved circuit only affects sessions it is added to from now on. To change a circuit inside sessions, edit those sessions ("editCircuit").
  - Save a circuit when it will be reused across sessions or phases; a one-off can be spelled out in its session instead.

2) "phases" - a phase is a named training emphasis plus its TYPICAL WEEK (the sessions every week following that phase gets). See PHASES above for each phase's current typical week.
  { "action": "add", "name": "Power", "sessions": [ SESSION, ... ] }   (empty "sessions" = a rest phase)
  { "action": "edit", "name": "Capacity", "rename": "Base", "sessions": [ SESSION, ... ] }   (replace the whole typical week)
  { "action": "edit", "name": "Capacity", "sessionChanges": [ SESSION CHANGE, ... ] }   (change individual sessions - preferred for small changes)
  { "action": "delete", "name": "Old Phase" }   (reassign its weeks in "weeks", or they keep following it)
  - Editing a phase changes the sessions that still follow it (every week where the athlete hasn't changed, moved or deleted them). Sessions they have already changed or logged keep what they are. To change one week only, edit the week instead.

3) "weeks" - one entry per week ("week") or per range of weeks ("from" + "to", inclusive). Week ids look like "2026-W40" and should be from the Target Timeframe. Three ways to set a week, pick one per entry:
  a) Follow a phase:     { "from": "2026-W40", "to": "2026-W43", "phase": "Power", "blockNotes": "why this block" }
     The weeks get the phase's typical week; their planned sessions are replaced by it (anything the athlete changed or deleted in those weeks is reset to the phase). Prefer this whenever a week is just "a normal week of phase X" - it keeps the plan short and the weeks follow later phase edits.
  b) Spell the week out: { "week": "2026-W44", "phase": "Deload", "sessions": [ SESSION, ... ] }
     The week's planned sessions become exactly these ("phase" optional). Use for a week that differs a lot from its phase (a test week, a trip, a taper week).
  c) Edit the week:      { "week": "2026-W45", "sessionChanges": [ SESSION CHANGE, ... ] }
     Changes what the week has now (see TARGET WEEKS above - a week that "follows its phase" has its phase's typical week). Use for small differences: one extra session, a lighter day, a changed value. Add "phase" too to base the edits on a different phase's typical week.
  d) A phase for exact days: { "fromDate": "2026-10-15", "toDate": "2026-11-01", "phase": "Deload", "blockNotes": "why" }
     Phases are ranges of DAYS, so one may start or end mid-week (BLOCKS above show "startDate"/"endDate" for a block that does; a week can hold two phases). This only sets the phase for those days (both inclusive; the blocks there are cut to make room): sessions are NOT touched - ones still following a phase move to the new one by themselves, ones the athlete changed or logged stay. Needs "phase"; don't combine with "week"/"from"/"to", "sessions" or "sessionChanges" (use a week entry for those). Use it only when the boundary really falls mid-week (a trip, a taper that starts Thursday); otherwise whole weeks (a) are simpler.
  Any entry may also carry "notes" (a note for that week - applied to each week of a range). "blockNotes" needs "phase".
  Completed sessions are never changed. Don't include weeks you are not changing.

4) "planB" - uncertain days: a second version of a few days (e.g. outdoor if the weather is good, otherwise indoor). Plan A is the normal plan from the sections above; a Plan B entry says only what Plan B does differently on those days. The athlete decides on the day (or earlier), and until then the plan counts one of the two.
  { "start": { "week": "2026-W43", "day": "Saturday" }, "end": { "week": "2026-W44", "day": "Monday" }, "label": "Outdoor if dry", "outdoor": "B", "likely": "A",
    "changes": [
      { "week": "2026-W43", "sessionChanges": [ { "action": "edit", "match": { "dayOfWeek": "Saturday" }, "set": { "name": "Outdoor bouldering" }, "exercises": [ EXERCISE, ... ] } ] },
      { "week": "2026-W44", "sessionChanges": [ { "action": "remove", "match": { "name": "Max hangs", "dayOfWeek": "Monday" } } ] }
    ] }
  { "start": { "week": "2026-W43", "day": "Saturday" }, "repeatUntil": "2026-W50", "changes": [ ... ] }   (the same Plan B every week through 2026-W50 - describe the first week; later weeks find their sessions by name)
  { "action": "delete", "start": { "week": "2026-W45", "day": "Saturday" } }   (removes the Plan B covering that day - see PLAN B above)
  - "start"/"end" (inclusive, "end" optional for one day, at most 14 days) are the uncertain days; they may cross weeks and phase changes. Every change must be on one of those days.
  - "changes" are SESSION CHANGEs per week, applied to Plan A: edit a session into its Plan B version, "remove" what Plan B drops, "add" what Plan B adds. Put knock-on effects in the same Plan B (e.g. outdoor on Saturday, so Monday's hard fingers session becomes rest) - that is what it's for.
  - "outdoor": which plan ("A" or "B") is the outdoor one - the athlete gets a weather hint for it. "likely": the plan that counts until they decide (default "A"); pick the more probable one.
  - Plan both versions so that EITHER one works with the rest of the week - no hard session the day before a likely hard outdoor day, recovery after it in that plan only.
  - Only add a Plan B where there is real uncertainty (the athlete names such days, or a trip/outdoor season makes it likely). Keep Plan A the plan you'd pick without the uncertainty.

${COACH_NOTES_INSTRUCTIONS}

${AI_PLACES_INSTRUCTIONS}

SESSION (used in "sessions" and in an "add" session change):
  { "name": "Limit bouldering", "dayOfWeek": "Tuesday", "startTime": "18:00", "plannedDuration": 90, "place": "Steinbock Konstanz", "notes": "About the session as a whole", "exercises": [ EXERCISE, ... ] }
  EXERCISE: { "exerciseTypeName": "Limit Bouldering", "values": { ... } }
  CIRCUIT (in a session's "exercises", like an EXERCISE):
    { "circuit": "Core A" }   or   { "circuit": "Core A", "rounds": 4, "transition": 20, "roundRest": 45 }   (a saved circuit, optionally re-timed - how to progress it)
    { "circuit": { "name": "Pull superset", "rounds": 4, "transition": 15, "roundRest": 60 }, "exercises": [ EXERCISE, ... ] }   (spelled out here)
  - A circuit or superset is done in ROUNDS: one set of each of its exercises in order, "transition" seconds between them, "roundRest" seconds after each round (none after the last). "rounds" is required for a spelled-out circuit.
  - Inside a circuit each exercise's "values" describe ONE SET: a time ("timeOn" seconds, e.g. 60 for a plank) or a count ("reps"), plus weight etc. Its own rest between sets ("timeBetweenSets"/"timeOff" as set rest) is ignored - the rest it really gets is everything else in the round plus the transitions and round rest. Give an exercise "sets" only if it should stop after that many rounds. Each exercise has its own time or reps (e.g. 45 s of planche, 10 s of front lever, 8 pull-ups in one circuit). "transition" is the default pause after every exercise; give an exercise "restAfter" (seconds, 0 = go straight on) in its "values" to override it for that exercise only, e.g. a long rest after a hard hold and none after an easy one. The last exercise of a round is followed by "roundRest" instead.
  - A REPEATER (hangboard or any on/off intervals) can be a circuit member: give "timeOn" (seconds of each hang), "reps" (how many hangs in one set) and "timeOff" (seconds of rest between the hangs, only counted as rep rest when "timeOn" is set). The app runs it inside the circuit as hang / rest / hang / rest ... with a rep counter, then moves on to the next exercise; the circuit's "transition" and "roundRest" are the rests between sets. E.g. a 7 s hang, 3 s rest, 6 hangs per set, 3 rounds = { "exerciseTypeName": "Hangboard repeaters", "values": { "timeOn": 7, "timeOff": 3, "reps": 6 } } in a circuit with "rounds": 3, "roundRest": 120.
  - ONE SET IS ONE TURN: a one-sided exercise (a stretch or hold "per side", single-leg or single-arm work) needs one rep per side - "reps": 2 with "timeOn" of the time per side and "timeOff" as the pause to switch sides, e.g. 30 s per side with 5 s to switch = { "timeOn": 30, "timeOff": 5, "reps": 2, "repLabel": "Side" } ("repLabel" makes the timer say "Side 1/2" and "Switch"; "Arm"/"Leg" work the same way; leave it out for ordinary reps). Without "reps": 2 the app does only ONE 30 s hold per round. Never write "per side" in the notes without also giving "reps": 2.
  - Use a superset to fill a long rest efficiently: e.g. weighted pull-ups (4 x 6) with antagonist push work and a mobility drill between sets, rounds = the pull-up sets, and "roundRest" chosen so the pull-ups still get about the rest they need. Use circuits for core, prehab and conditioning blocks. Don't superset two hard finger or maximal-strength exercises with each other.
  - "name" required. "dayOfWeek" (Monday ... Sunday), "startTime" ("HH:mm", 24-hour), "plannedDuration" (whole minutes, the whole session incl. warm-up) optional.
  - "place" (optional): where the session is - the name of one of "My Places" above, exactly as written (if there is no such section, leave it out - or add the place in "places" in this same answer and name it here). Pick the place that suits the session: a board session where there is a board, outdoor work at a crag, and check the place's opening hours against the start time. Any other text is accepted (an outside venue) but has no weather and no notes behind it.
  TEST (in a session's "exercises", like an EXERCISE): { "test": "Max Hang", "conditions": { "Edge depth": 20 }, "values": { "notes": "after the warm-up, full rest between attempts" } }
  Other examples: { "test": "Weighted Pullup", "conditions": { "Reps": 1 } } = find the heaviest single; { "test": "Weighted Pullup", "conditions": { "Added weight": 10 } } = max reps at +10 kg.
  - This schedules a benchmark test inside the session: the athlete enters the result during the session and the app records it, so progress is measured. Use only names from "Tests" above (if there is no such section, there are no tests). "conditions" is what is SET beforehand, by the names of the test's "fields" (any of them, a result field too); leave out what the athlete is to FIND (the heaviest single sets "Reps": 1 and leaves the weight open; a rep test at a given load sets the weight and leaves the reps open). Fields marked "usuallySame" are what results are compared by - repeat the last result's values for them unless the plan is to test something else, e.g. a different weight or edge to fill a gap in the history; weights are kg. A test takes about 10 minutes - leave room for it.
  - Bodyweight is NOT a test: it is a daily reading the athlete logs under Metrics (Home). Never schedule a "Bodyweight"/"Weigh-in" test, even if one is named in the request - if a weigh-in matters (before a hang test, say) write "weigh in and log it under Metrics" in the session or week notes. A test with that name is dropped.
  - Schedule a test that is due ("due": true - done before, and not for the retest interval), when the athlete is fresh: after a rest day or in a deload or easy week, early in the session, never after a hard day or at the end of a heavy one. One or two tests per session at most, and not before a key session. A test marked "neverDone" is optional: add it only if the athlete asks. Don't add one that is already planned ("plannedIn"). Remove or move a planned test with an EXERCISE CHANGE on "exerciseTypeName": "Test: Max Hang".
  - Write the test plan down: when you schedule a test, or decide one should wait, add a short coach note (see "coachNotes") so the next request still knows the intention - and remove the note once the test is done.

SESSION CHANGE (in "sessionChanges"):
  { "action": "add", "session": SESSION }
  { "action": "remove", "match": { "name": "Recovery", "dayOfWeek": "Sunday" } }
  { "action": "edit", "match": { "dayOfWeek": "Thursday" }, "set": { "name": ..., "dayOfWeek": ..., "startTime": ..., "plannedDuration": ..., "place": ..., "notes": ... }, "exerciseChanges": [ EXERCISE CHANGE, ... ] }
  { "action": "edit", "match": { "name": "Board" }, "exercises": [ EXERCISE, ... ] }   (replace all of that session's exercises)
  - "match" picks exactly one existing session by "name" and/or "dayOfWeek" - use the names and days shown above. If a name or a day alone is ambiguous, give both.
  - "set" holds only the fields that change. "exercises" and "exerciseChanges" can't both be used in one edit.

EXERCISE CHANGE (in "exerciseChanges"):
  { "action": "add", "exercise": EXERCISE, "position": 1 }   ("position" 1-based, optional - default is at the end)
  { "action": "remove", "match": { "exerciseTypeName": "Core" } }
  { "action": "edit", "match": { "exerciseTypeName": "Hangboard", "occurrence": 2 }, "values": { "sets": 6, "weight": null }, "exerciseTypeName": "Max Hangs 7s" }
  { "action": "add", "exercise": CIRCUIT, "position": 3 }   (a whole circuit; never placed inside another one)
  { "action": "editCircuit", "circuit": "Core A", "set": { "rounds": 4, "transition": 10, "roundRest": 45, "name": "Core A+" } }   (re-time or rename a circuit already in the session - give only what changes)
  { "action": "removeCircuit", "circuit": "Core A" }   (removes the circuit and all its exercises)
  - Exercises inside a circuit are edited, added and removed like any other ("edit"/"remove" by "exerciseTypeName"); one added at a "position" between two of its exercises joins that circuit.
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

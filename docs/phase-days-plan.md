# Phases as date ranges, sessions saved one by one

Decided with Nathan on 2026-10-13. Written before any code, to be argued with.

## What changes, in one paragraph

A phase (a `TrainingBlock`) is a **range of days**, not of weeks, so it can start or end mid-week and a week can hold two or three. A planned session that comes from a phase's templates is **saved on its own**, only when you log it, change it or delete it - not the whole week at once - and a deleted one is remembered, so the template doesn't bring it back. Phases are edited **only in the Block manager**; the Plan's block view and calendar show and work with *sessions*. Weeks stay what they are: the grouping that sessions, week notes, Plan B and the weekly charts use. They are not a second phase system.

## How it works today (facts, from the code)

- `TrainingBlock { startWeekId, endWeekId }`, inclusive; `getDominantBlockForWeek` picks one phase per week (priority, then last created). About 112 references in 33 files.
- A week stores only its block until something edits it. Its sessions are *projected* from that phase's templates (`weekProjection.ts`); the first write to the week saves **the whole week** (`materializeWeekIfProvisional`), and a finished week is saved on app load (`materializePastWeeks`) so history doesn't change when templates do. "Lock In" saves a week by hand; `WeekOverride.customized` remembers "emptied on purpose".
- Projected ids are `prov:{weekId}:{templateId}:{index}`; they are kept when the week is saved.
- Data version is 3.34. Migrations take a backup first and check invariants; sync upgrades older devices' data forward and refuses to merge with a newer device (`SyncVersionError`); restoring a newer backup warns.

## Why whole-week saving has to go

With phases by day, saving the whole week on the first edit would freeze Thursday-Sunday's sessions from the *next* phase just because you touched Monday - they would stop following later phase edits. Per-session saving is what makes day-level phases useful, so it is part of the same change, not an extra.

## Target model

### Phases
- `startDate`, `endDate` (ISO "YYYY-MM-DD", inclusive) replace `startWeekId`, `endWeekId`. Concurrent blocks and `priority` stay.
- One question gets one function each: `phaseOnDay(date)` for days; `phasesInWeek(weekId)` (with days each) and `winningPhaseOfWeek(weekId)` for the weekly screens. Rule for the winner: priority first, then **most days**, a tie going to the later phase.
- Migration: week id -> that week's Monday / Sunday. Lossless. Old AI replies, backups and sync data are converted on the way in (as the old plan formats already are).

### Sessions from templates
- Effective sessions of a week = stored sessions + projected ones that are neither saved nor dismissed.
- Projection is per day: a template with a day comes from the phase on that day; a template **with no day** comes once per week from the week's winning phase, and floats in the week ("Unscheduled") until you give it a day or log it.
- After it exists, a session needs no phase. `blockId` is only a tag (set when a session is saved, from the phase on its day, or the week's winning phase if it has no day); nothing breaks without one.
- Projected id: `prov:{weekId}:{templateId}` (no index - an index shifts when templates are reordered). The same id marks a saved session as "this one, edited" and a dismissal as "this one, deleted".
- **Saving a session**: edit, log (live or by hand), move to another day, mark done. **Deleting one that is only projected** adds a dismissal (`{ id, weekId }`, a new synced table). Deleting a saved one that came from a template also adds one, so it doesn't spring back.
- Sessions of a **past day** that were never touched are saved at app load, as whole weeks are today, so history never moves when templates or phases change later. (Open: see question 1.)
- Gone: the week-level "Lock In", the week-level "Not saved yet" chip and `WeekOverride.customized`. Per-session "not saved yet" (dashed) stays. "Reset week to its phase" removes the week's saved planned sessions and its dismissals; finished sessions stay.
- Migration: every week that has saved sessions or `customized` is **sealed** by dismissing, once, everything its templates would project - so it shows exactly what is stored, as now. Weeks with nothing saved keep following their phase.

### Showing split weeks
- Block view grid: a week cell is drawn as side-by-side segments, one per phase in that week, as wide as its days (two phases usually, three or more work the same). Tooltip: "Power Mon-Wed, Deload Thu-Sun". Phase colours are Tailwind classes, so segments are child elements, not a gradient.
- The selected week's card: the phase title becomes the phase chips with their days; tapping opens the Block manager at that date. The "Select phase" dropdown goes.
- Calendar: the day-accurate phase strip (Week), a bar down each Month row, a mark per week in Year; a setting for Off / Name only / Strip.

### Block manager (the only place phases are edited)
Redesign is its own stage; to decide there: a timeline of blocks with start and end dates, "phase from this date" quick action, what happens to the neighbours when a range is moved (trim, split, never leave an accidental gap), concurrent blocks, how the weekly outlook counts a partial week.

## Stages

Each is test-first, one commit per concern, and leaves the app working.

| # | Stage | Notes |
| --- | --- | --- |
| 0 | Calendar: flat design, week as agenda (setting), tap an empty slot to add | independent, ships first |
| 1 | Block dates + migration + week helpers | behaviour-neutral; test: every week gives the same answer as before the migration; data 3.35 |
| 2 | Callers on dates: block review, Home card, Plan B, PDF, ICS, AI schema and block splitting, Block manager's pickers | one commit per area |
| 3 | Sessions saved one by one + dismissals + sealing migration | the risky one: copy week, Plan B, AI planner, reset/clear, undo, sync merge of the new table; data 3.36 |
| 4 | Day-level projection, split-week cells, the phase strip + its setting | |
| 5 | Block manager redesign | |
| 6 | Remove the old week fields | |
| 7 | Calendar: trips and competitions as bars, drag to reschedule (a move is "save this session on a new day") | |

Every version bump means all of Nathan's devices must update before sync resumes (the existing gate).

## Open questions (defaults in bold)

1. A past, never-touched planned session: **saved at app load, so history is fixed**, or left floating (history follows later template edits - not recommended)?
2. Block review with a block that starts mid-week: **count sessions by their date; weekly series use the whole weeks the block touches**, marked as partial.
3. Can the AI set block dates? **Yes: an optional date next to the week fields; week ids still accepted.**
4. In the Block manager: **one timeline list with date pickers; tap a block to edit** - to be sketched before stage 5.

## Progress log

### Stages 1, 2 and 6 (done together, data 3.35)
Kept as a dual model for one commit, then merged: two copies of one fact (weeks and dates) was a stale-data risk, and the compiler can find every caller once the week fields are gone from the type.
- `TrainingBlock` is `startDate`/`endDate` only (inclusive "YYYY-MM-DD"). Migration 3.34 -> 3.35 turns whole weeks into Monday/Sunday and drops the week ids (and a block with no usable weeks, which covered nothing). `normalizeBlock(s)` reads the old shape wherever it can still turn up: import, sync of older docs (through the same migration), plan-undo records written before 3.35.
- Helpers in `planning/trainingBlocks.ts`: `phaseOnDay`, `phasesInWeek`, `winningPhaseOfWeek` (= `getDominantBlockForWeek`, so every existing caller got the day-aware answer), `getBlocksForWeek`/`blockTouchesWeek`, `blockFirstWeekId`/`blockLastWeekId`/`blockWeekIds`. Day helpers in `dateUtils.ts`.
- Callers moved: block review (sessions counted by their own day, weekly series whole weeks, `partial` flag + line), paging/outlook (`nextBlock` by day, `daysUntilDate`), Home card, Plan-wide week lookups, copy-on-write projection, ICS export, AI context/planContext (week ids as before, plus exact days for a block that starts or ends mid-week), AI planner (`carveBlocks` on days), starter plans, demo data, storage (`assignPhaseToWeek`, `clearWeekData`), Block manager (two date inputs - the redesign is stage 5).
- Neutrality is tested: on random plans (priorities, overlaps, New Year, week 53) the new rule gives every week the answer the old week-id rule gave, and the migration is checked against the old rule too.
- **Judgment call - ties**: the plan said a tie in days goes "to the later phase". Implemented as *the block created later* (later in the list), not the later start, so that whole-week overlapping blocks behave exactly as before. It only matters for a week split into equal parts (3+3 days with a gap day).
- **Judgment call - AI**: AI replies still speak in week ids (phases cover whole weeks); an optional date for mid-week blocks (open question 3) is not built yet.
- **Found and fixed on the way**: `getWeekId` gave the wrong week from April to October in southern-hemisphere zones (Auckland: a daylight-saving hour made a `Math.ceil` overshoot). It now uses calendar arithmetic; tested in five zones.
- Not yet checked on a screen: the Block manager's date inputs, Home's "Next block" line (now shows the start date).

### Stage 3 - sessions saved one by one (done, data 3.36)
- Projected id is `prov:{weekId}:{templateId}` (no index). A stored session with that id stands in for its template; `dismissedSessions` (`{id, weekId}`, synced like any table) remembers a deleted one; `prov:{weekId}:*` dismisses the whole week.
- `weekProjection.ts` rewritten: `projectWeekWorkouts` (templates not stored and not dismissed), `effectiveWorkoutsForWeek` (stored + projected), `weekDiffersFromPhase`, `projectedSessionsInThePast`. Day-level projection is in it from the start (stage 4's projection half): a template with a day comes from the phase that has that day, a template with no day once from the week's winning phase.
- Writes: `saveWorkout` stores one session and forgets its dismissal (undo of a delete); `deleteWorkout` of a template session removes it and dismisses it; `dismissSession` for one never stored; `saveProjectedSessions` for past days (run on app load with the day-start-aware "today"); `resetWeekToPhaseDefaults` drops saved planned sessions and the week's dismissals; `clearWeekData` dismisses the week whole when a longer block still covers it; AI/copy-week `applyPlanWrites` dismisses a week given its own list and forgets the dismissals of one that follows its phase.
- Migration 3.35 -> 3.36: every week with anything stored, or `customized`, gets the whole-week dismissal (so it shows exactly what it stores, whatever the templates say later); `weekOverrides` is dropped. Sync: `upgradeDoc` now hands migrations the doc's own tables, not only today's, so an older device's `weekOverrides` reaches this step.
- Gone: `materializeWeek*`, Lock In, the week-level "not saved yet" chip and grid icon, `WeekOverride`, `assignPhaseToWeek`. The planner's `customized` flag is gone too: a week given a list is dismissed whole, `planned: null` follows its phases (completed sessions stay and stand in for their templates).
- Judgment calls: (1) the whole-week dismissal is also what keeps migrated weeks fixed when a phase is later swapped (a per-template dismissal would let the new phase's sessions appear beside the old ones); (2) "Reset week" is offered when a week has saved planned sessions or any dismissal and a phase with templates behind it.

### Stages 4 and 5 - split weeks, Block manager, calendar strip (done)
- Block grid: a week with more than one run of phases is drawn in side-by-side segments (`weekRuns`), tooltip "Power Mon–Wed, Deload Thu–Sun". Week card: a chip per phase (with its days when split) - tapping opens the Block manager on that day; the "Select phase" dropdown is gone.
- Block manager (`BlockManager.svelte`, pure ops in `planning/blockEdit.ts`): opened on a day it shows what is there and "Start a phase on this day" (`startPhaseOn`: the block there is cut the day before, the new one runs to where it ended, inheriting its priority); First/Last day date inputs; saving places the block and carves **same-priority** neighbours (shorten / split / remove) - blocks of another priority are concurrent emphases and stay. Under the dates: what happens to the others ("Deload now starts 17 Oct") and the days it leaves without a phase. One write for all of it (`setTrainingBlocks`), with Undo.
- Calendar: phase strip under the days in Day/Week, a bar down the week list's rows, a bar under each date in Month; Settings: "Show phases in the calendar" (on) and "Write the phase name on it" (off). Tapping the strip opens the Block manager. Not done: a mark per week in Year.

### Stage 7 - trips, competitions, drag (done)
- Trips and competitions are bars across their days in Day/Week (rows when they overlap; cut at the edge when they go on), a bar along the top of each day in Month, a line on their days in the week list.
- Hold-and-drag (~0.35 s, 8 px slop) moves a planned session to another day/time (quarter hours, kept inside the day, the grab point kept); a press that moves at once stays a scroll or swipe; finished, running and Plan B sessions can't be dragged. Verified with emulated touch in headless Chrome, not on a phone.

### Still open
- Open question 3: the AI cannot yet set a block's first/last day (it speaks in week ids; it is told the exact days of a block that starts or ends mid-week).
- A phase mark per week in the Year view.
- Nothing here has been run on a real phone, and none of the migrations has met Nathan's real data - run `docs/qa-checklist.md` section 12 (12.1 first) before pushing. All devices must update before sync resumes (data 3.36).

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

### Stage 1 (done, data 3.35)
- `startDate`/`endDate` on `TrainingBlock` (optional in the type until stage 6). Migration 3.34 -> 3.35 writes them from the weeks; `withBlockDates` is applied wherever blocks are saved (`_saveTrainingBlocks`, `applyPlanWrites`, import, coalescing). **For now the weeks still decide**: any write path that changes only week ids gets fresh dates. Stage 2 flips this (dates decide, weeks derived) once every writer sets dates.
- Helpers in `planning/trainingBlocks.ts`: `blockStartDate`, `blockEndDate`, `phaseOnDay`, `phasesInWeek`, `winningPhaseOfWeek`; day helpers in `dateUtils.ts` (`addDaysIso`, `weekMondayIso`, `weekSundayIso`, `weekDayIsos`, `weekIdOfIso`).
- Neutrality is tested: on random plans (priorities, overlaps, New Year, week 53) `winningPhaseOfWeek` gives what `getDominantBlockForWeek` gave.
- **Judgment call - ties**: the plan said a tie in days goes "to the later phase". Implemented as *the block created later* (later in the list), not the later start, so that whole-week overlapping blocks behave exactly as before. It only matters for a week split into equal parts (3+3 days with a gap day).
- **Found and fixed on the way**: `getWeekId` gave the wrong week from April to October in southern-hemisphere zones (Auckland: a daylight-saving hour made a `Math.ceil` overshoot). It now uses calendar arithmetic; tested in five zones.

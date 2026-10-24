# AI context: what the coach gets, and how much (2026-10-24 .. 11-04)

Started from "analyse what the AI gets, improve it, balance everything against prompt length". Measured on the demo data (a real backup was not available in the cloud session); tokens are `chars / 3.5`, which probably under-counts numbers and JSON.

## Measured (generate, default settings, compact)

| | before | after |
| --- | --- | --- |
| whole prompt | ~13.8k | ~10.5k (Plan B / tests / places off), ~11.7k with them |
| reply rules ("HOW TO ANSWER" .. end) | ~8.8k (64 %) | ~6.3k / ~7.5k |
| context-only prompt | ~4.3k | not re-measured |

The 9k target was not reached without cutting guidance the validator relies on; the remaining rules are mostly the exercise-values reference (~1.1k tokens) and the session/circuit rules (~0.9k).

## Found and fixed

1. Completed sessions dropped hang time, rest, hold, edge, grades, board, style (only sets/reps/weight/duration/custom were sent).
2. Analyze Past read readiness as of *today* and had no recovery, other training or patterns; now as of the end of the analysed weeks, with a review block per week (patterns stay out - not tied to a window).
3. Missed sessions were invisible beyond three weeks: weekly history lines carry `missed` names.
4. Duplicates: readiness trends vs Recovery, sleep/RHR/weight lines in weekly reviews vs Recovery's weekly rows, score as a float.
5. Unbounded growth: every test result ever, 20 raw ascents, a full exercise list repeating its field lists. Now latest 4 per test plus best per set-up; ascents as a grade summary plus the latest 6 (4 compact); shared field lists named once.
6. Breakdown preview lumped Recovery/Other/Patterns/Goals/Places under "Readiness"; now each has its own line.

## Decisions (Nathan, 2026-10-24)

Order: fixes first, then Garmin. Rules: shorten for everyone, optional parts only when relevant. Activity digest: on, list detail only. Re-import refreshes already imported activities. Target ~9k. Garmin fields: pace/splits/drift and zones start on; training effect + load, VO2max, sleep stages start on; climb/cadence/temperature and training readiness off; everything per-group switchable with its cost. Tests and ascents shrunk. Exercise list: dedupe only (not "used-only"). Readiness drops trends when Recovery is on. Ask-about-activity button added. Missed sessions: count + names per week.

## Judgment calls

- Plan B / tests / coach notes / places rules are included by `contractFor`: Plan B when uncertain days are set, a Plan B is in the plan, or the request matches `plan b|uncertain|weather|rain|dry|either way`; places when "My Places" exists or the request names a place; tests only with a Tests section; coach notes whenever that sharing switch is on. A request phrased otherwise gets a contract without the part - the model can then not use it. Both regexes are in `coachPrompt.ts`.
- Session `date` is the UTC day of the stored timestamp, as `workoutDay` does everywhere else in the app; a session finished just after local midnight can show the previous day. Not changed.
- Zones are made at read time from stored 10-bpm bins and `estimateMaxHr`, so one setting for the highest heart rate applies to all activities. Garmin's own zone times were not used (unit unclear).
- `ExternalActivity.stats` is an optional field: no migration and no data-version bump. Sync carries it as part of the record; two-device behaviour was not tried.
- Training readiness is parsed from a guessed file name/layout; it only matters if the export has such a file.

## Not done / open

- Real-data check of everything above (FIT field numbers 15/18/20/23/24/57/125/137 and laps; Garmin summary field names `aerobicTrainingEffect`, `anaerobicTrainingEffect`, `activityTrainingLoad`). QA 28.10.
- Rules are still ~6.3k tokens; more would need cutting examples the contract tests expect.
- The tune sheet inside the AI coach still shows only the two detail levels, not the new switches.
- Phone checks: none.

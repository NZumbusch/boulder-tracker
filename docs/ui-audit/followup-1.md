# Follow-up round, part 1: data, state, logging, preferences

Branch `claude/ui-followup`. Decisions: `followup-decisions.md`. Logic and migrations were test-first (`npm test`: 2188 pass; the one unhandled error from `offlineIcons.test.ts` is the sandbox not reaching the icon service, as before). No new icons were needed, no data-model change, no migration. Visual parts were looked at in headless Chrome only (`scripts/audit/screens/followup1.mjs`, phone portrait light, one laptop shot); **nothing was tried on a real phone, and the Android-only parts (fatigue reminder scheduling, restore snapshot in a file on the phone) are covered by unit tests with the native plugins mocked.**

| # | Item | State | Notes |
| --- | --- | --- | --- |
| 1a | Pain check-in Undo | done | Every trend (better/same/worse/gone) shows an Undo toast (`checkInPain`). Tested for all four. |
| 1b | Clear week text | done | `formatWeekWithDates`: "Week 42 (Oct 12 - Oct 18)". |
| 1c | Restore previous | done | A restore (`storage.importData`) first keeps a copy of the data it replaces in one slot (localforage key on the web, `boulder_tracker_pre_restore.json` on Android; wiped by Delete all data). Settings > Sync & backup shows "Restore previous" when a copy exists; it confirms, puts it back, and keeps the other side so a second tap switches back. A cancelled import keeps nothing. Not in sync or exports. Judgment call: only the last restore is kept. |
| 2 | Log a past session | done | Button in the top bar of History and Plan opens a sheet (day, optional time, future refused) then the usual editor on a done session with a date chip; after Save the rating sheet opens. It is a normal stored session (`session/pastSession.ts`); tests read it back through `getWorkoutsForWeek`. Not added to the Log a workout screen (not asked). Judgment call: the date chip exists only while creating, not when editing old sessions. |
| 3 | Plan B in the planned list | done | The list is on **Log a workout** (App passes it to StartScreen), not Home. New `getStartableWorkoutsForWeek`: adds the other side's sessions while a Plan B is undecided, tagged "Plan A/B"; once decided the unchosen side drops out. Home, widget and numbers still use the counted side. |
| 4 | Empty-session warning | done | `session/emptySession.ts`. Editor Save (done session with no logged work, or planned one with no exercises) and the rating sheet (live finish, Log as planned). Not asked again for a session that was already empty when opened or already saved done. Skipped slots and notes-only values do not count as work. |
| 5 | AI sharing defaults | done, nothing was actually inconsistent | Stored defaults and descriptions already said off for Readiness and Pain issues; the page's "on" test was just per-id special-cased. Now one table (`AI_SHARING_ON_BY_DEFAULT`), `aiSharingOn()` for the switches, and "Off by default." added by `sharingHint` instead of written into descriptions; a test pins stored defaults, table and hints together, and that an explicit saved choice survives loading. No migration. |
| 6 | Fatigue reminder switch | done | Tunable `alerts.fatigueReminder` (default on), switch in Settings > Reminders (replaces the "no switch" text). Off cancels the pending fatigue notifications; on reschedules. Device-local like other tunables. |
| 7 | 12-hour clock | done | Tunable `ui.clock12` (default off) in Settings > Plan calendar & day. One formatter `lib/timeFormat.ts` (tested) used by the calendar grid and gutter, week list, event sheet, session preview, editor time chip, Home Today card, session viewer, Log a workout list, Plan list rows, week share image, PDF export, plan history and the log view. Left 24-hour on purpose: stored values, ICS, AI prompts, and the native time pickers (they follow the phone). Gutter widened when on so "5 PM" does not wrap. |

## Left for the caller

- Release note `2026-10-25-past-sessions-and-clock`, QA section 21.
- `ui-round-2/README.md` leftovers for `state.svelte.ts` are now done; it was not edited.
- Not looked at: the empty-session dialogs on screen, the date chip's native date picker on Android, the Restore previous flow end to end with a real file.

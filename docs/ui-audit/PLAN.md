# Full UI audit: plan

Goal: every screen, sheet, modal and Settings page looks right and calm on phone, tablet and laptop, portrait and landscape, light and dark. Nothing overflows, clips, is tiny or is hard to tap. Anything that needs a taste decision is NOT guessed: it goes into `docs/ui-audit/questions.md` for later.

## Harness

`node scripts/audit/run.mjs --area=<area> --out=<dir> [--only=id,id --vp=phone-p --themes=light]` (dev server on its own port, `--port`/`--app`). Each area has `scripts/audit/screens/<area>.mjs` exporting `screens = [{ id, area, setup(c), pages?, teardown? }]`. Output: PNG per screen/theme/viewport, `report.json`, `flagged.txt`, contact sheets.

Viewports: phone-p 390x844, phone-l 844x390, tablet-p 820x1180, tablet-l 1180x820, laptop 1366x768. Themes: light, dark.
Automatic checks: horizontal page overflow, elements off screen, tap targets under 40px, text under 11px, clipped text, icon buttons without a label, console errors. The flagged list is the first thing to read; the contact sheets are the second (look for crowding, ugly stretching on wide screens, cramped landscape, low contrast).

## Areas (one agent each, run one at a time)

| Area | Screens to cover (setup each state, including empty and full) | Components |
| --- | --- | --- |
| shell | App bar, bottom bar, rail, drawer, FAB, toast, update card, what's new, onboarding (welcome, intro slides, iOS steps), tour, in-app-browser banner, example data banner | nav, onboarding, tour, update, common |
| home | Home with every card (also customised, empty, example data), ACWR sheet, taper sheet, pain check-in, timers | dashboard, health |
| plan | Calendar month/week/day/agenda, goals, phases, session preview, event sheet, goal form, block manager/browser, AI coach, AI send, ask about, Plan B, plan history, share images | plan |
| workout | Start screen, active session, run sheets, exercise log/details/form/picker, groups, circuits, quick timer, session exit/notes/actions/review/AI, set detail, workout editor/view/modal, test sheet | workout |
| history-sends | History (list, detail, share image), sends log/form/import, grade chart, pain screens/issues/report, bodyweight log, benchmark form | history, sends, health, common |
| analytics | Every tab, every panel, week detail, block review, exercise progress sheet, benchmarks, empty states | analytics |
| settings | Settings index and EVERY page: general, units, sessions, exercises, circuits, phases, targets, places, sound/voice/audio, timers, reminders, notifications, home layout, widgets, charts, analytics categories, AI (sharing, direct, prompt tuning, history picker, coach notes), device calendar, health connect, sync, backup, export/PDF, transfer, tunables, error log, feedback, about, what's new, app update | settings |

## Rules for agents

1. Work on your own branch off `claude/ui-audit`; commit often; do not push; never touch another agent's files; shared files (`src/app.css`, `src/components/ui/*`, `src/App.svelte`) belong to the shell agent. Needs in other files go into your status file as handoffs.
2. Fix without asking: overflow, clipping, tiny text (use `text-micro`), small tap targets, missing labels, console errors, broken landscape/tablet/laptop layouts, wide-screen stretching (cap widths), contrast of existing tokens, dead code (list it, remove only if clearly unused).
3. Do not decide: removing or adding features, wording that changes meaning, new settings, re-ordering of content, colour choices. Log each as a question in `docs/ui-audit/questions.md` (area, screen id, one line of options and a recommendation).
4. Tests, `npm run check` pass before each commit; `npm run build` before the last one. No attribution lines of any kind.
5. Status file `docs/ui-audit/<area>.md`: screens covered (every id), findings fixed, skipped, handoffs, shots actually looked at. Honest: nothing was tried on a real phone.

## Coverage

Every `.svelte` file under `src/components` must appear in exactly one area screen (or be marked dead/unreachable in the status file). The shell agent produces the check at the end: `scripts/audit/coverage.mjs` (list of component files vs. screen ids named in the status files).

# Boulder Tracker - notes for Claude

Read `docs/HANDOVER.md` first: it holds the working agreements, release flow, data-model facts, current state and known gaps. Plans and progress logs are in `docs/` (`phase-days-plan.md`, `navigation-plan.md`, `qa-checklist.md`).

Essentials:

- Svelte 5 (runes) + Vite + Tailwind v4 + TypeScript, Capacitor Android. Local-first; no server.
- Before every commit: `npm test` and `npm run check` must pass; `npm run build` before pushing. Test logic and migrations first; one commit per concern.
- **A push to `main` ships to Testing devices** (web + signed APK). Commit or push only when asked; never push half-done work. Never change the signing key or the `versionCode` rule.
- Ask Nathan (short multiple-choice, with a recommendation) on design/taste decisions; for taste calls offer both behind a setting. Flag ambiguities and log judgment calls in the plan docs.
- Be honest about what was only checked headless: nothing from the latest work has been tried on a real phone.
- `stuff/` and `*.private.test.ts` are git-ignored and hold Nathan's private data: never commit, print or publish them.
- New sheets/modals call `backWhile(() => open, close)`; new settings go through the registries (`preferences/tunables.ts`, `homeDetails.ts`); after using a new icon run `npm run icons`.
- Read weeks with `trainingState.getWorkoutsForWeek(weekId)`, never by filtering `workouts`.
- No attribution: commit messages and PR descriptions carry no `Co-Authored-By: Claude` / `Claude-Session` lines or session links (Nathan's rule; also set in `.claude/settings.json`), and no mention of the model.
- Browser checks: `scripts/headless/` (see the traps in HANDOVER.md).

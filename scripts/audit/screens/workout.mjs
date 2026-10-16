// Workout: start screen, the live session (empty, running, progress, paused, edit mode, add form, picker, log sheet, circuits,
// timers), the circuit runner, quick timer, session exit / notes / actions, test sheet, and the workout modal (view, editor, AI).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Writes the example data (changed by `mutate`, a function body that gets `d` and `iso(daysFromToday)`) into storage and reloads. */
async function seed(c, mutate = '') {
  await c.st(`const url = performance.getEntriesByType('resource').map(r=>r.name).find(n=>/localforage/.test(n));
    const lf = (await import(url)).default; lf.config({ name: 'boulder-tracker', storeName: 'training_data_v2' });
    const { buildDemoData } = await import('/src/lib/tour/demoData.ts');
    const d = buildDemoData();
    const iso = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
    ${mutate}
    for (const k of Object.keys(d)) if (k !== 'exportVersion') await lf.setItem(k, d[k]);
    await lf.setItem('database_version', d.exportVersion)`);
  await c.send('Page.reload'); await sleep(4500);
  await c.st(`t.preferencesStore.setWelcomeDone(true)`); await sleep(500);
}
const EMPTY = `for (const k of ['workouts','goals','planAlternatives','weekNotes','dismissedSessions','coachNotes']) d[k] = [];`;

/** A session with every kind of row: a timed hang, per-set pull-ups, a free session, mobility. */
const FULL = (extra = '') => `({"id":"audit-full","status":"planned","date":new Date().toISOString(),"weekId":t.currentWeekId,"notes":"Fingers and pulling","startTime":"18:00","loadFactor":0,"exercises":[
 {"id":"a1","typeId":"max-hangs","activeParameters":["sets","reps","timeOn","timeOff","holdType","weight","holdSize"],"prescribed":{"sets":5,"reps":1,"timeOn":10,"timeOff":0,"timeBetweenSets":180,"holdType":"Half Crimp","weight":12,"holdSize":20,"notes":"Warm up with two light sets first and keep the shoulders packed in the whole time."}},
 {"id":"a2","typeId":"weighted-pullups","activeParameters":["sets","reps","weight"],"prescribed":{"sets":4,"reps":[6,6,5,5],"weight":10}},
 {"id":"a3","typeId":"free-bouldering","activeParameters":["duration","boulderingGrades"],"prescribed":{"duration":600,"minGrade":"6A","maxGrade":"7A"}},
 {"id":"a4","typeId":"mobility","activeParameters":["duration","mobilityType"],"prescribed":{"duration":10,"mobilityType":["Shoulders","Hips"]}}${extra}]})`;
const TEST_SLOT = `,{"id":"a5","typeId":"test","test":{"typeId":"max-hang","name":"Max hang"},"prescribed":{"duration":15}}`;
const BLANK = `({"id":"audit-blank","status":"planned","date":new Date().toISOString(),"weekId":t.currentWeekId,"notes":"New Session","startTime":"18:00","loadFactor":0,"exercises":[]})`;
const CIRCUIT_WORKOUT = `JSON.parse(JSON.stringify(t.workouts.find(x => x.id === 'demo-circuit-session')))`;

/** A module the app itself loaded (a plain import after an edit can give a second copy with its own state). */
const mod = (name) => `const U_${name.replace(/\W/g, '')} = performance.getEntriesByType('resource').map(r => r.name).find(n => /${name.replace(/\./g, '\\.')}/.test(n)); const ${name.split('.')[0]} = await import(U_${name.replace(/\W/g, '')});`;

/** Ends whatever session, timer or modal a screen left running, so the next one starts clean. */
async function clean(c) {
  await c.st(`${mod('workoutModal.svelte.ts')} ${mod('quickTimer.svelte.ts')}
    try { t.sessionStore.discard(); } catch {}
    workoutModal.closeWorkout(); quickTimer.endQuickRun(); quickTimer.closeQuickTimerSheet();
    for (const k of ['boulder_tracker_circuit_run', 'boulder_tracker_active_timer', 'boulder_tracker_active_session']) localStorage.removeItem(k);
    t.uiStore.settingsPageRequest = undefined;
    t.navigate('home')`);
  await sleep(500);
  // Anything left on screen (sheets) goes with the reload-free reset above; a stray dialog is closed with Escape.
  for (let i = 0; i < 2; i++) if (await c.ev(`!!document.querySelector('[role=dialog]')`)) await c.close();
}
/** Starts a session on `workoutJs` (a JS expression) and lands on the session screen. */
async function session(c, workoutJs, { settle = 900 } = {}) {
  await clean(c);
  await c.nav('add');
  let ok;
  for (let i = 0; i < 3 && ok !== 'true'; i++) { ok = await c.st(`return String(t.startSession(${workoutJs}))`); if (ok !== 'true') { await sleep(1000); await clean(c); await c.nav('add'); } }
  if (ok !== 'true') throw new Error('session did not start: ' + ok);
  await sleep(settle);
}
const sess = (c, js) => c.st(`const sx = t.sessionStore; ${js}`);
const must = async (c, text, opts) => { if (!(await c.click(text, opts))) throw new Error('no button: ' + text); await sleep(400); };
/** Clicks inside the open session screen only (the app behind it has buttons too). */
const inSession = (c, text, opts = {}) => must(c, text, opts);

const startScreen = async (c) => { await clean(c); await c.nav('add'); };
const presets = `[{ id: 'p1', name: 'Repeaters 7/3', variant: 'timed', leadIn: 5, values: { sets: 5, reps: 6, timeOn: 7, timeOff: 3, timeBetweenSets: 180 } }, { id: 'p2', name: 'Pacer 5 min a problem', variant: 'pacer', leadIn: 5, values: { cadence: 5, sets: 12 } }]`;
const presetsOn = (c) => c.st(`for (const p of ${presets}) t.saveTimerPreset(p)`);
const presetsOff = (c) => c.st(`for (const p of [...t.timerPresets]) t.deleteTimerPreset(p.id)`);
const openWorkout = async (c, workoutJs, mode = 'view', isNew = false) => {
  await clean(c); await c.nav('home');
  await c.st(`${mod('workoutModal.svelte.ts')} workoutModal.openWorkout(${workoutJs}, ${JSON.stringify(mode)}, ${isNew})`); await sleep(900);
};
const COMPLETED = `JSON.parse(JSON.stringify(t.workouts.find(x => x.status === 'completed' && x.exercises.length > 2)))`;
const DEMO_PLANNED = `JSON.parse(JSON.stringify(t.workouts.find(x => x.id === 'demo-circuit-session')))`;
/** The circuit session with its runner open (lead-in running). */
const runner = async (c) => { await session(c, CIRCUIT_WORKOUT); await inSession(c, 'Start circuit'); await sleep(500); };
/** Skips sets in the runner until its screen shows `text` (a counted exercise, a rest). */
const skipTo = async (c, text) => { for (let i = 0; i < 10; i++) { if (await c.ev(`document.body.innerText.includes(${JSON.stringify(text)})`)) return; await c.ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Skip (set|rest)/.test(x.textContent.trim())&&x.getBoundingClientRect().width>0); b&&b.click()})()`); await sleep(500); } };
const closeN = async (c, n = 2) => { for (let i = 0; i < n; i++) await c.close(); };

export const screens = [
  // ---- Start screen
  { id: 'wk-start', area: 'workout', pages: 2, setup: startScreen, teardown: clean },
  { id: 'wk-start-empty', area: 'workout', setup: async (c) => { await seed(c, EMPTY); await startScreen(c); }, teardown: async (c) => { await clean(c); await seed(c); } },
  { id: 'wk-start-running', area: 'workout', pages: 2, setup: async (c) => { await session(c, CIRCUIT_WORKOUT); await sess(c, `sx.minimize()`); await sleep(500); await c.nav('add'); }, teardown: clean },
  { id: 'wk-start-test', area: 'workout', pages: 3, setup: async (c) => { await startScreen(c); await must(c, 'Log a test', { exact: false }); await sleep(500); await c.scrollTo(1); }, teardown: clean },

  // ---- Quick timer
  { id: 'wk-timer-sheet', area: 'workout', pages: 2, setup: async (c) => { await startScreen(c); await must(c, 'Timer Intervals', { exact: false }); await sleep(500); }, teardown: clean },
  { id: 'wk-timer-presets', area: 'workout', pages: 2, setup: async (c) => { await presetsOn(c); await startScreen(c); await must(c, 'Timer Intervals', { exact: false }); await sleep(500); }, teardown: async (c) => { await clean(c); await presetsOff(c); } },
  { id: 'wk-timer-pacer', area: 'workout', pages: 2, setup: async (c) => { await startScreen(c); await must(c, 'Timer Intervals', { exact: false }); await must(c, 'Pacer', { within: '[role=dialog]' }); }, teardown: clean },
  { id: 'wk-timer-run', area: 'workout', setup: async (c) => { await startScreen(c); await must(c, 'Timer Intervals', { exact: false }); await must(c, 'Open timer', { exact: false, within: '[role=dialog]' }); await sleep(800); }, teardown: clean },

  // ---- Live session
  { id: 'wk-session-circuit', area: 'workout', pages: 2, setup: (c) => session(c, CIRCUIT_WORKOUT), teardown: clean },
  { id: 'wk-session-empty', area: 'workout', setup: (c) => session(c, BLANK), teardown: clean },
  { id: 'wk-session-full', area: 'workout', pages: 2, setup: (c) => session(c, FULL(TEST_SLOT)), teardown: clean },
  { id: 'wk-session-progress', area: 'workout', pages: 2, setup: async (c) => { await session(c, FULL(TEST_SLOT)); await sess(c, `sx.logExercise('a1', { sets: 5, reps: 1, timeOn: 10, weight: 12, holdSize: 20, holdType: 'Half Crimp' }); sx.skipExercise('a2')`); await sleep(700); }, teardown: clean },
  { id: 'wk-session-paused', area: 'workout', setup: async (c) => { await session(c, FULL()); await sess(c, `sx.pause()`); await sleep(500); }, teardown: clean },
  { id: 'wk-session-done', area: 'workout', pages: 2, setup: async (c) => { await session(c, FULL()); await sess(c, `sx.logExercise('a1', { sets: 5, reps: 1, timeOn: 10, weight: 12 }); sx.logExercise('a2', { sets: 4, reps: [6,6,5,5], weight: 10 }); sx.logExercise('a3', { duration: 600, minGrade: '6A', maxGrade: '7A' }); sx.logExercise('a4', { duration: 10 })`); await sleep(700); }, teardown: clean },
  { id: 'wk-session-log', area: 'workout', pages: 3, setup: async (c) => { await session(c, FULL()); await inSession(c, 'Finish exercise'); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-log-sets', area: 'workout', pages: 3, setup: async (c) => { await session(c, FULL()); await sess(c, `sx.logExercise('a1', { sets: 5, reps: 1, timeOn: 10, weight: 12 }); sx.focusExercise(1)`); await sleep(500); await inSession(c, 'Finish exercise'); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-skip-ask', area: 'workout', setup: async (c) => { await session(c, CIRCUIT_WORKOUT); await sess(c, `sx.logExercise(sx.exercises[0].id, { duration: 45 })`); await sleep(600); await inSession(c, 'Skip'); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-add', area: 'workout', pages: 2, setup: async (c) => { await session(c, FULL()); await inSession(c, 'Add'); await sleep(400); await c.close(); await sleep(400); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-add-todo', area: 'workout', pages: 2, setup: async (c) => { await session(c, FULL()); await inSession(c, 'Add'); await c.close(); await inSession(c, 'Still to do'); await sleep(400); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-add-picker', area: 'workout', pages: 2, setup: async (c) => { await session(c, FULL()); await inSession(c, 'Add'); await sleep(500); }, teardown: async (c) => { await closeN(c, 2); await clean(c); } },
  { id: 'wk-session-edit', area: 'workout', pages: 2, setup: async (c) => { await session(c, CIRCUIT_WORKOUT); await inSession(c, 'Edit'); await sleep(500); }, teardown: clean },
  { id: 'wk-session-edit-full', area: 'workout', pages: 2, setup: async (c) => { await session(c, FULL(TEST_SLOT)); await inSession(c, 'Edit'); await sleep(500); }, teardown: clean },
  { id: 'wk-session-edit-pick', area: 'workout', pages: 2, setup: async (c) => { await session(c, FULL()); await inSession(c, 'Edit'); await inSession(c, 'Circuit'); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-edit-group', area: 'workout', pages: 2, setup: async (c) => { await session(c, CIRCUIT_WORKOUT); await inSession(c, 'Edit'); await inSession(c, 'Core A', { exact: false }); await sleep(500); }, teardown: clean },
  { id: 'wk-session-edit-test', area: 'workout', pages: 2, setup: async (c) => { await session(c, FULL()); await inSession(c, 'Edit'); await inSession(c, 'Test'); await sleep(600); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-test-log', area: 'workout', pages: 2, setup: async (c) => { await session(c, FULL(TEST_SLOT)); await sess(c, `sx.focusExercise(4)`); await sleep(500); await inSession(c, 'Finish exercise'); await sleep(600); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-notes', area: 'workout', setup: async (c) => { await session(c, FULL()); await inSession(c, 'Session notes'); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-notes-filled', area: 'workout', setup: async (c) => { await session(c, FULL()); await sess(c, `sx.updateWorkout({ notes: 'Fingers and pulling' })`); await inSession(c, 'Session notes'); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-exit', area: 'workout', setup: async (c) => { await session(c, FULL()); await sess(c, `sx.logExercise('a1', { sets: 5, reps: 1, timeOn: 10 })`); await inSession(c, 'End the session'); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-exit-empty', area: 'workout', setup: async (c) => { await session(c, BLANK); await inSession(c, 'End the session'); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-session-bubble', area: 'workout', setup: async (c) => { await session(c, FULL()); await sess(c, `sx.minimize()`); await sleep(500); await c.nav('home'); }, teardown: clean },
  { id: 'wk-session-actions', area: 'workout', setup: async (c) => { await clean(c); await c.nav('home'); await c.st(`${mod('sessionActions.svelte.ts')} sessionActions.openSessionActions(${DEMO_PLANNED}, [])`); await sleep(700); }, teardown: async (c) => { await c.st(`${mod('sessionActions.svelte.ts')} sessionActions.closeSessionActions()`); await clean(c); } },
  { id: 'wk-session-actions-done', area: 'workout', setup: async (c) => { await clean(c); await c.nav('home'); await c.st(`${mod('sessionActions.svelte.ts')} sessionActions.openSessionActions(${COMPLETED}, [])`); await sleep(700); }, teardown: async (c) => { await c.st(`${mod('sessionActions.svelte.ts')} sessionActions.closeSessionActions()`); await clean(c); } },

  // ---- Workout modal
  { id: 'wk-view-planned', area: 'workout', pages: 2, setup: (c) => openWorkout(c, FULL(TEST_SLOT).replace(/^\(/, '(').replace(/\)$/, ')')), teardown: clean },
  { id: 'wk-view-circuit', area: 'workout', pages: 2, setup: (c) => openWorkout(c, DEMO_PLANNED), teardown: clean },
  { id: 'wk-view-completed', area: 'workout', pages: 3, setup: (c) => openWorkout(c, COMPLETED), teardown: clean },
  { id: 'wk-view-empty', area: 'workout', setup: (c) => openWorkout(c, BLANK), teardown: clean },
  { id: 'wk-editor-new', area: 'workout', pages: 2, setup: (c) => openWorkout(c, BLANK, 'edit', true), teardown: clean },
  { id: 'wk-editor-full', area: 'workout', pages: 3, setup: (c) => openWorkout(c, FULL(TEST_SLOT), 'edit'), teardown: clean },
  { id: 'wk-editor-circuit', area: 'workout', pages: 3, setup: (c) => openWorkout(c, DEMO_PLANNED, 'edit'), teardown: clean },
  // ---- Circuit runner (the demo session's Core A, 3 rounds)
  { id: 'wk-runner-lead', area: 'workout', setup: async (c) => { await session(c, CIRCUIT_WORKOUT); await inSession(c, 'Start circuit'); await sleep(600); }, teardown: clean },
  { id: 'wk-runner-go', area: 'workout', setup: async (c) => { await runner(c); await inSession(c, "I'm ready"); await sleep(1200); }, teardown: clean },
  { id: 'wk-runner-paused', area: 'workout', setup: async (c) => { await runner(c); await inSession(c, "I'm ready"); await sleep(600); await inSession(c, 'Pause'); await sleep(400); }, teardown: clean },
  { id: 'wk-runner-end', area: 'workout', setup: async (c) => { await runner(c); await inSession(c, "I'm ready"); await sleep(600); await inSession(c, 'End'); await sleep(400); }, teardown: clean },
  { id: 'wk-runner-restart', area: 'workout', setup: async (c) => { await runner(c); await inSession(c, 'Restart the circuit'); await sleep(400); }, teardown: clean },
  { id: 'wk-runner-setdetail', area: 'workout', setup: async (c) => { await runner(c); await inSession(c, "I'm ready"); await sleep(600); await inSession(c, 'Set details', { exact: false }); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-runner-info', area: 'workout', setup: async (c) => { await runner(c); await inSession(c, 'Hollow hold', { exact: false }); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-runner-rest', area: 'workout', setup: async (c) => { await runner(c); await inSession(c, "I'm ready"); await sleep(600); await inSession(c, 'Skip set'); await sleep(600); }, teardown: clean },
  { id: 'wk-runner-counted', area: 'workout', setup: async (c) => { await runner(c); await inSession(c, "I'm ready"); await sleep(500); await skipTo(c, 'Reps done'); }, teardown: clean },
  { id: 'wk-runner-minimised', area: 'workout', setup: async (c) => { await runner(c); await inSession(c, "I'm ready"); await sleep(500); await inSession(c, 'Minimise —', { exact: false }); await sleep(500); }, teardown: clean },
  // A single exercise's own timer (the hang), its adjust sheet and the preset name sheet
  { id: 'wk-solo-timer', area: 'workout', setup: async (c) => { await session(c, FULL()); await inSession(c, 'Timer'); await sleep(700); }, teardown: clean },
  { id: 'wk-solo-go', area: 'workout', setup: async (c) => { await session(c, FULL()); await inSession(c, 'Timer'); await sleep(500); await inSession(c, 'Start'); await sleep(1500); }, teardown: clean },
  { id: 'wk-solo-adjust', area: 'workout', pages: 2, setup: async (c) => { await session(c, FULL()); await inSession(c, 'Timer'); await sleep(500); await inSession(c, 'Adjust the numbers'); await sleep(500); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-solo-preset-name', area: 'workout', setup: async (c) => { await session(c, FULL()); await inSession(c, 'Timer'); await sleep(500); await inSession(c, 'Adjust the numbers'); await sleep(400); await c.ev(`(()=>{const i=[...document.querySelectorAll('[role=dialog] input')][0]; const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i, String(Number(i.value)+1)); i.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(300); await inSession(c, 'Apply and save as a preset'); await sleep(600); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-timer-run-go', area: 'workout', setup: async (c) => { await startScreen(c); await must(c, 'Timer Intervals', { exact: false }); await must(c, 'Open timer', { exact: false, within: '[role=dialog]' }); await sleep(500); await must(c, 'Start'); await sleep(1500); }, teardown: clean },
  { id: 'wk-timer-run-minimised', area: 'workout', setup: async (c) => { await startScreen(c); await must(c, 'Timer Intervals', { exact: false }); await must(c, 'Open timer', { exact: false, within: '[role=dialog]' }); await sleep(500); await must(c, 'Minimise —', { exact: false }); await sleep(500); }, teardown: clean },
  { id: 'wk-editor-ai', area: 'workout', pages: 3, setup: async (c) => { await openWorkout(c, FULL(), 'edit'); await must(c, 'AI', { exact: false }); await sleep(700); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-editor-test', area: 'workout', pages: 2, setup: async (c) => { await openWorkout(c, FULL(), 'edit'); await must(c, 'Test'); await sleep(600); }, teardown: async (c) => { await closeN(c, 1); await clean(c); } },
  { id: 'wk-runner-volume', area: 'workout', setup: async (c) => { await runner(c); await inSession(c, 'Cue volume', { exact: false }); await sleep(400); }, teardown: clean },
];

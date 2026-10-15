// Plan: the Weeks view (blocks, week card, goals), the calendar (day, week grid/list, month, year), phone-calendar events,
// session preview, goal form, block manager and browser, AI coach / send / history, ask about, Plan B, week share image.
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
const restore = async (c) => { await c.st(`t.navigate('home')`); await seed(c); };
const EMPTY = `for (const k of ['workouts','goals','planAlternatives','weekNotes','dismissedSessions','coachNotes']) d[k] = [];`;

const TUNABLES = ['plan.weekAgenda', 'plan.exerciseList', 'plan.highContrast', 'plan.eventEdges', 'plan.weekListOnPhone', 'plan.calendarPhases', 'plan.calendarPhaseNames', 'plan.calendarPhaseTint', 'plan.calendarCategoryColors'];
const resetTunables = (c) => c.st(`for (const id of ${JSON.stringify(TUNABLES)}) t.setTunable(id, undefined)`);
const setTunables = (c, o) => c.st(`for (const [k, v] of Object.entries(${JSON.stringify(o)})) t.setTunable(k, v)`);

/** Opens the Plan screen in the Weeks (blocks) or Calendar view, in the given calendar mode. */
async function plan(c, { view = 'blocks', mode = 'week' } = {}) {
  await c.ev(`localStorage.setItem('plan.view', ${JSON.stringify(view)}); localStorage.setItem('plan.calendarMode', ${JSON.stringify(mode)})`);
  await c.st(`t.navigate('home')`); await sleep(500);
  await c.nav('plan'); await sleep(600);
}
/** A few phone-calendar events around today, put straight into the store (a browser has no phone calendar). */
const EVENTS_JS = `const { deviceCalendar } = await import('/src/lib/calendar/deviceCalendar.svelte.ts');
  const n = new Date(); const base = Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000);
  const mk = (id, title, dd, startMin, minutes, color, extra = {}) => ({ id, title, calendarId: 'c1', day: base + dd, startMin, minutes, allDay: startMin === undefined, begin: (base + dd) * 86400000 + (startMin ?? 0) * 60000, end: (base + dd) * 86400000 + ((startMin ?? 0) + (minutes || 1440)) * 60000, firstDay: base + dd, lastDay: base + dd, color, ...extra });
  deviceCalendar.load = async () => {};
  deviceCalendar.calendars = [{ id: 'c1', name: 'Personal', account: 'me@example.com', color: '#7e57c2', visible: true }, { id: 'c2', name: 'Work', account: 'me@work.example', color: '#26a69a', visible: true }];
  deviceCalendar.supported = true; deviceCalendar.granted = true; deviceCalendar.selected = ['c1', 'c2'];
  deviceCalendar.enabled = true;
  deviceCalendar.events = [
    mk('e1', 'Dentist appointment with a rather long title', 0, 17 * 60, 60, '#e57373', { location: 'Seestrasse 12, Konstanz', notes: 'Bring the insurance card.\\nCheck-up and cleaning.' }),
    mk('e2', 'Team lunch', 0, 12 * 60, 90, '#4fc3f7'),
    mk('e3', 'Conference', 1, undefined, 0, '#ffb74d'),
    mk('e4', 'Call', 1, 8 * 60, 30, '#81c784'),
    mk('e5', 'Birthday', 2, undefined, 0, '#f06292'),
    mk('e6', 'Physio', 3, 18 * 60, 45, '#7e57c2'),
    mk('e7', 'Meeting', 4, 9 * 60, 120, '#26a69a', { calendarId: 'c2' }),
    mk('e8', 'Late dinner', 4, 19 * 60, 120, '#e57373'),
    mk('e9', 'Holiday', 9, undefined, 0, '#4fc3f7'),
  ];`;
const eventsOn = (c) => c.st(EVENTS_JS);
const eventsOff = (c) => c.st(`const { deviceCalendar } = await import('/src/lib/calendar/deviceCalendar.svelte.ts');
  delete deviceCalendar.load; deviceCalendar.events = []; deviceCalendar.enabled = false; deviceCalendar.calendars = []; deviceCalendar.supported = false; deviceCalendar.granted = false; deviceCalendar.selected = [];`);
const aiKeyOn = (c) => c.st(`const { saveKey } = await import('/src/lib/ai/direct/store.ts'); saveKey('anthropic', 'sk-ant-audit-not-a-real-key')`);
const aiKeyOff = (c) => c.ev(`localStorage.removeItem('bt.aiKey.anthropic')`);
/** Two plan changes the coach can roll back (an AI change and a copied week), written straight into the undo store. */
const historyOn = async (c) => { const r = await c.st(`const { writePlanUndo, readPlanUndo } = await import('/src/lib/storage/persistence.ts');
  const now = Date.now();
  await writePlanUndo([
    { source: 'copy', appliedAt: new Date(now - 86400000).toISOString(), before: { workouts: [], trainingBlocks: [] }, after: { workouts: [], trainingBlocks: [] }, label: { goal: '', lines: ['Copied week 41 over week 42 (2 sessions)'] } },
    { source: 'ai', appliedAt: new Date(now - 3600000).toISOString(), before: { workouts: [], trainingBlocks: [] }, after: { workouts: [], trainingBlocks: [] }, label: { goal: 'Tired this week, swap Thursday for a rest day and keep the long Saturday session for outdoor bouldering if it is dry', lines: ['Moved Board Session to Friday', 'Added a rest day on Thursday', 'Shortened Dynamic Moves by 15 minutes', 'Changed the finger block to repeaters', 'Dropped one core exercise', 'Added a mobility finisher'] } },
  ]); return JSON.stringify(await readPlanUndo()).length`); if (!(Number(r) > 100)) throw new Error('plan history not written: ' + r); };
const historyOff = (c) => c.st(`const { writePlanUndo } = await import('/src/lib/storage/persistence.ts'); await writePlanUndo(null)`);
/** Opens the Ask AI sheet through its store (the call is a function body that sees askAboutSession/-Block/-Insights and `t`). */
async function askOpen(c, call) {
  await plan(c);
  // The module URL the app itself loaded (a plain import after an edit can give a second copy, with its own state).
  await c.st(`const u = performance.getEntriesByType('resource').map(r => r.name).find(n => /askAbout\\.svelte\\.ts/.test(n)) || '/src/lib/ai/askAbout.svelte.ts';
    const { askAboutSession, askAboutBlock, askAboutInsights } = await import(u); ${call}`); await sleep(900);
  if (!(await c.ev(`!!document.querySelector('[role=dialog]')`))) throw new Error('ask sheet did not open');
}
const closeN = async (c, n = 2) => { for (let i = 0; i < n; i++) await c.close(); };
const clickSession = (c) => c.click('Board Session', { exact: false });

export const screens = [
  // Weeks (block) view
  { id: 'plan-weeks', area: 'plan', pages: 3, setup: (c) => plan(c) },
  { id: 'plan-weeks-empty', area: 'plan', pages: 2, setup: async (c) => { await seed(c, EMPTY); await plan(c); }, teardown: restore },
  { id: 'plan-week-actions', area: 'plan', pages: 2, setup: async (c) => { await plan(c); await c.click('Week actions'); await sleep(400); }, teardown: async () => {} },
  { id: 'plan-week-share', area: 'plan', pages: 2, setup: async (c) => { await plan(c); await c.click('Week actions'); await c.click('Share this week as an image', { exact: false }); await sleep(1200); }, teardown: (c) => closeN(c, 1) },
  { id: 'plan-week-note', area: 'plan', setup: async (c) => { await plan(c); await c.click('Add a week note'); await sleep(500); } },
  // Goals (bottom of the Weeks view)
  { id: 'plan-goals', area: 'plan', pages: 3, setup: async (c) => { await plan(c); await c.scrollTo(1); await sleep(300); } },
  { id: 'plan-goal-form-new', area: 'plan', pages: 2, setup: async (c) => { await plan(c); await c.click('Add competition', { exact: false }); await sleep(500); await c.scrollTo(1); await sleep(300); } },
  { id: 'plan-goal-form-trip', area: 'plan', pages: 2, setup: async (c) => { await plan(c); await c.click('Add outdoor trip', { exact: false }); await sleep(500); await c.scrollTo(1); await sleep(300); } },
  { id: 'plan-goal-form-edit', area: 'plan', pages: 2, setup: async (c) => { await plan(c); if (!(await c.click('Fontainebleau', { exact: false }))) throw new Error('no goal row'); await sleep(600); await c.scrollTo(1); await sleep(300); } },
  { id: 'plan-goals-empty', area: 'plan', pages: 2, setup: async (c) => { await seed(c, EMPTY); await plan(c); await c.scrollTo(1); await sleep(300); }, teardown: restore },

  // Calendar views
  { id: 'plan-cal-week-grid', area: 'plan', pages: 2, setup: async (c) => { await setTunables(c, { 'plan.weekAgenda': false, 'plan.weekListOnPhone': false }); await plan(c, { view: 'calendar', mode: 'week' }); }, teardown: resetTunables },
  { id: 'plan-cal-week-list', area: 'plan', pages: 3, setup: async (c) => { await setTunables(c, { 'plan.weekAgenda': true }); await plan(c, { view: 'calendar', mode: 'week' }); }, teardown: resetTunables },
  { id: 'plan-cal-week-list-exercises', area: 'plan', pages: 3, setup: async (c) => { await setTunables(c, { 'plan.weekAgenda': true, 'plan.exerciseList': true }); await plan(c, { view: 'calendar', mode: 'week' }); }, teardown: resetTunables },
  { id: 'plan-cal-day', area: 'plan', pages: 2, setup: (c) => plan(c, { view: 'calendar', mode: 'day' }) },
  { id: 'plan-cal-month', area: 'plan', pages: 2, setup: (c) => plan(c, { view: 'calendar', mode: 'month' }) },
  { id: 'plan-cal-year', area: 'plan', pages: 2, setup: (c) => plan(c, { view: 'calendar', mode: 'year' }) },
  { id: 'plan-cal-week-empty', area: 'plan', setup: async (c) => { await seed(c, EMPTY); await setTunables(c, { 'plan.weekAgenda': false, 'plan.weekListOnPhone': false }); await plan(c, { view: 'calendar', mode: 'week' }); }, teardown: async (c) => { await resetTunables(c); await restore(c); } },
  { id: 'plan-cal-week-list-empty', area: 'plan', setup: async (c) => { await seed(c, EMPTY); await setTunables(c, { 'plan.weekAgenda': true }); await plan(c, { view: 'calendar', mode: 'week' }); }, teardown: async (c) => { await resetTunables(c); await restore(c); } },
  { id: 'plan-cal-month-empty', area: 'plan', setup: async (c) => { await seed(c, EMPTY); await plan(c, { view: 'calendar', mode: 'month' }); }, teardown: restore },
  { id: 'plan-cal-day-empty', area: 'plan', setup: async (c) => { await seed(c, EMPTY); await plan(c, { view: 'calendar', mode: 'day' }); }, teardown: restore },
  { id: 'plan-cal-year-empty', area: 'plan', setup: async (c) => { await seed(c, EMPTY); await plan(c, { view: 'calendar', mode: 'year' }); }, teardown: restore },
  // Nothing at all: no sessions and no phase blocks
  { id: 'plan-weeks-nothing', area: 'plan', pages: 2, setup: async (c) => { await seed(c, EMPTY + `d.trainingBlocks = [];`); await plan(c); }, teardown: restore },
  { id: 'plan-cal-week-nothing', area: 'plan', setup: async (c) => { await seed(c, EMPTY + `d.trainingBlocks = [];`); await setTunables(c, { 'plan.weekAgenda': false, 'plan.weekListOnPhone': false }); await plan(c, { view: 'calendar', mode: 'week' }); }, teardown: async (c) => { await resetTunables(c); await restore(c); } },
  { id: 'plan-cal-month-nothing', area: 'plan', setup: async (c) => { await seed(c, EMPTY + `d.trainingBlocks = [];`); await plan(c, { view: 'calendar', mode: 'month' }); }, teardown: restore },
  // Calendar with the phone's events and the look options
  { id: 'plan-cal-week-events', area: 'plan', pages: 2, setup: async (c) => { await setTunables(c, { 'plan.weekAgenda': false, 'plan.weekListOnPhone': false }); await plan(c, { view: 'calendar', mode: 'week' }); await eventsOn(c); await sleep(500); }, teardown: async (c) => { await eventsOff(c); await resetTunables(c); } },
  { id: 'plan-cal-list-events', area: 'plan', pages: 3, setup: async (c) => { await setTunables(c, { 'plan.weekAgenda': true }); await plan(c, { view: 'calendar', mode: 'week' }); await eventsOn(c); await sleep(500); }, teardown: async (c) => { await eventsOff(c); await resetTunables(c); } },
  { id: 'plan-cal-day-events', area: 'plan', pages: 2, setup: async (c) => { await plan(c, { view: 'calendar', mode: 'day' }); await eventsOn(c); await sleep(500); }, teardown: eventsOff },
  { id: 'plan-cal-month-events', area: 'plan', pages: 2, setup: async (c) => { await plan(c, { view: 'calendar', mode: 'month' }); await eventsOn(c); await sleep(500); }, teardown: eventsOff },
  { id: 'plan-cal-contrast', area: 'plan', pages: 2, setup: async (c) => { await setTunables(c, { 'plan.weekAgenda': false, 'plan.weekListOnPhone': false, 'plan.highContrast': true }); await plan(c, { view: 'calendar', mode: 'week' }); await eventsOn(c); await sleep(500); }, teardown: async (c) => { await eventsOff(c); await resetTunables(c); } },
  { id: 'plan-cal-edges', area: 'plan', pages: 2, setup: async (c) => { await setTunables(c, { 'plan.weekAgenda': false, 'plan.weekListOnPhone': false, 'plan.eventEdges': true, 'plan.calendarPhaseNames': true, 'plan.calendarCategoryColors': true }); await plan(c, { view: 'calendar', mode: 'week' }); await eventsOn(c); await sleep(500); }, teardown: async (c) => { await eventsOff(c); await resetTunables(c); } },
  { id: 'plan-cal-contrast-month', area: 'plan', setup: async (c) => { await setTunables(c, { 'plan.highContrast': true, 'plan.calendarPhaseNames': true }); await plan(c, { view: 'calendar', mode: 'month' }); await eventsOn(c); await sleep(500); }, teardown: async (c) => { await eventsOff(c); await resetTunables(c); } },
  { id: 'plan-cal-phases-off', area: 'plan', setup: async (c) => { await setTunables(c, { 'plan.calendarPhases': false, 'plan.weekAgenda': false, 'plan.weekListOnPhone': false }); await plan(c, { view: 'calendar', mode: 'week' }); }, teardown: resetTunables },
  // Sheets from the calendar
  { id: 'plan-session-preview', area: 'plan', pages: 2, setup: async (c) => { await setTunables(c, { 'plan.weekAgenda': true }); await plan(c, { view: 'calendar', mode: 'week' }); if (!(await clickSession(c))) throw new Error('no session to click'); await sleep(700); }, teardown: async (c) => { await closeN(c, 1); await resetTunables(c); } },
  { id: 'plan-event-sheet', area: 'plan', pages: 2, setup: async (c) => { await setTunables(c, { 'plan.weekAgenda': true }); await plan(c, { view: 'calendar', mode: 'week' }); await eventsOn(c); await sleep(500); if (!(await c.click('Dentist', { exact: false }))) throw new Error('no event'); await sleep(700); }, teardown: async (c) => { await closeN(c, 1); await eventsOff(c); await resetTunables(c); } },

  // Block manager and browser
  { id: 'plan-block-manager', area: 'plan', pages: 3, setup: async (c) => { await plan(c); await c.click('Phases and training blocks'); await sleep(700); } },
  { id: 'plan-block-manager-empty', area: 'plan', pages: 2, setup: async (c) => { await seed(c, `d.trainingBlocks = [];`); await plan(c); await c.click('Phases and training blocks'); await sleep(700); }, teardown: async (c) => { await closeN(c, 1); await restore(c); } },
  { id: 'plan-block-browser', area: 'plan', pages: 3, setup: async (c) => { await plan(c); await c.click('Phases and training blocks'); await sleep(500);
      const ok = await c.click('Browse', { exact: false, within: '[role=dialog]' }) || await c.click('timeline', { exact: false, within: '[role=dialog]' }) || await c.click('all', { exact: false, within: '[role=dialog]' }); if (!ok) throw new Error('no browse button'); await sleep(700); }, teardown: (c) => closeN(c, 2) },

  // AI
  { id: 'plan-ai-coach', area: 'plan', pages: 4, setup: async (c) => { await plan(c); await c.click('AI Coach'); await sleep(900); } },
  { id: 'plan-ai-coach-empty', area: 'plan', pages: 3, setup: async (c) => { await seed(c, EMPTY); await plan(c); await c.click('AI Coach'); await sleep(900); }, teardown: async (c) => { await closeN(c, 1); await restore(c); } },
  { id: 'plan-ai-analyze', area: 'plan', pages: 3, setup: async (c) => { await plan(c); await c.click('AI Coach'); await sleep(700); await c.click('Analyze', { within: '[role=dialog]' }); await sleep(600); } },
  { id: 'plan-ai-context', area: 'plan', pages: 2, setup: async (c) => { await plan(c); await c.click('AI Coach'); await sleep(700); await c.click('Context', { within: '[role=dialog]' }); await sleep(600); } },
  { id: 'plan-ai-organise', area: 'plan', pages: 3, setup: async (c) => { await plan(c); await c.click('AI Coach'); await sleep(700); await c.click('Organise', { within: '[role=dialog]' }); await sleep(600); } },
  { id: 'plan-ai-paste', area: 'plan', pages: 2, setup: async (c) => { await plan(c); await c.click('AI Coach'); await sleep(700); await c.click('I have the reply', { exact: false }); await sleep(600); } },
  { id: 'plan-ai-direct', area: 'plan', pages: 3, setup: async (c) => { await aiKeyOn(c); await plan(c); await c.click('AI Coach'); await sleep(900); }, teardown: async (c) => { await closeN(c, 1); await aiKeyOff(c); } },
  { id: 'plan-ai-send', area: 'plan', pages: 2, setup: async (c) => { await aiKeyOn(c); await plan(c); await c.click('AI Coach'); await sleep(700); if (!(await c.click('directly', { exact: false }))) throw new Error('no direct button'); await sleep(700); }, teardown: async (c) => { await closeN(c, 2); await aiKeyOff(c); } },
  { id: 'plan-ai-history', area: 'plan', pages: 2, setup: async (c) => { await historyOn(c); await plan(c); await c.click('AI Coach'); await sleep(900); if (!(await c.click('History', { exact: true, within: '[role=dialog]' }))) throw new Error('no History button'); await sleep(700); }, teardown: async (c) => { await closeN(c, 2); await historyOff(c); } },
  { id: 'plan-ask-session', area: 'plan', pages: 2, setup: async (c) => { await askOpen(c, `askAboutSession(t.workouts.find(x => x.status === 'completed').id)`); } },
  { id: 'plan-ask-block', area: 'plan', pages: 2, setup: async (c) => { await askOpen(c, `askAboutBlock(t.trainingBlocks[0].id)`); } },
  { id: 'plan-ask-insights', area: 'plan', pages: 2, setup: async (c) => { await askOpen(c, `const { INSIGHT_GROUPS } = await import('/src/lib/analytics/insights.ts'); askAboutInsights(INSIGHT_GROUPS[0].id)`); } },
  { id: 'plan-ask-direct', area: 'plan', pages: 2, setup: async (c) => { await aiKeyOn(c); await askOpen(c, `askAboutSession(t.workouts.find(x => x.status === 'completed').id)`); }, teardown: async (c) => { await closeN(c, 1); await aiKeyOff(c); } },

  // Plan B
  { id: 'plan-planb-week', area: 'plan', pages: 2, setup: async (c) => { await plan(c); await c.scrollTo(0.45); await sleep(300); } },
  { id: 'plan-planb-sheet', area: 'plan', pages: 2, setup: async (c) => { await plan(c); if (!(await c.click('Edit', { exact: true }))) throw new Error('no Plan B edit button'); await sleep(900); }, teardown: (c) => closeN(c, 1) },
  { id: 'plan-planb-editing', area: 'plan', pages: 3, setup: async (c) => { await plan(c); await c.click('Edit', { exact: true }); await sleep(800); if (!(await c.click("Change Plan B's sessions", { exact: false }))) throw new Error('no change button'); await sleep(900); }, teardown: async (c) => { await c.st(`t.finishPlanBEditing()`); await sleep(400); } },
  { id: 'plan-planb-new', area: 'plan', pages: 2, setup: async (c) => { await seed(c, `d.planAlternatives = [];`); await plan(c); await c.click('Week actions'); await c.click('Plan B for uncertain days', { exact: false }); await sleep(900); }, teardown: async (c) => { await c.st(`t.finishPlanBEditing()`); await sleep(300); await restore(c); } },
];

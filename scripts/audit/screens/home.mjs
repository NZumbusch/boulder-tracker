// Home: dashboard cards (full, empty, customised, example data), ACWR and taper sheets, pain screens, quick log, bodyweight, timers.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PLACES = `[{ name: 'Steinbock Konstanz', kind: 'gym', price: 'CHF 22', hours: 'Mon-Fri 9-22', notes: 'Board on the left wall' }, { name: 'Brione', kind: 'crag', latitude: 46.3, longitude: 8.8 }, { name: 'Home wall', kind: 'home', latitude: 47.66, longitude: 9.17 }]`;

/** Writes the example data (changed by `mutate`, a function body that gets `d` and `iso(daysFromToday)`) into storage and reloads. */
async function seed(c, mutate = '') {
  await c.st(`const url = performance.getEntriesByType('resource').map(r=>r.name).find(n=>/localforage/.test(n));
    const lf = (await import(url)).default; lf.config({ name: 'boulder-tracker', storeName: 'training_data_v2' });
    const { buildDemoData } = await import('/src/lib/tour/demoData.ts');
    const d = buildDemoData(); d.places = ${PLACES};
    const iso = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
    const wk = (n) => { const x = new Date(); x.setDate(x.getDate() + n); const t0 = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())); const dn = t0.getUTCDay() || 7; t0.setUTCDate(t0.getUTCDate() + 4 - dn); const y0 = new Date(Date.UTC(t0.getUTCFullYear(),0,1)); return t0.getUTCFullYear() + '-W' + String(Math.ceil(((t0 - y0)/86400000 + 1)/7)).padStart(2,'0'); };
    ${mutate}
    for (const k of Object.keys(d)) if (k !== 'exportVersion') await lf.setItem(k, d[k]);
    await lf.setItem('database_version', d.exportVersion)`);
  await c.send('Page.reload'); await sleep(4500);
  await c.st(`t.preferencesStore.setWelcomeDone(true)`); await sleep(500);
}
const EMPTY = `for (const k of ['workouts','dailyMetrics','benchmarks','painLogs','painIssues','outdoorAscents','goals','dismissedSessions','weekNotes','planAlternatives','coachNotes']) d[k] = [];`;
// One open issue (a finger pulley, watched under Fingers), checked in 3 days ago and yesterday.
const OPEN_PAIN = `d.painIssues.push({ id: 'a-open', bodyPart: 'Right finger - ring A2', region: 'finger', side: 'right', detail: 'ring A2', startDate: iso(-6), watchCategories: ['Fingers', 'Hangboard'] });
  d.painIssues.push({ id: 'a-open2', bodyPart: 'Left shoulder', region: 'shoulder', side: 'left', startDate: iso(-30), notes: 'Comes and goes after pulling days' });
  d.painLogs.push({ id: 'pl1', date: iso(-6), weekId: wk(-6), bodyPart: 'Right finger - ring A2', severity: 5, issueId: 'a-open', kinds: ['sharp'], timing: ['during'] });
  d.painLogs.push({ id: 'pl2', date: iso(-3), weekId: wk(-3), bodyPart: 'Right finger - ring A2', severity: 4, trend: 'same', issueId: 'a-open' });
  d.painLogs.push({ id: 'pl3', date: iso(-20), weekId: wk(-20), bodyPart: 'Left shoulder', severity: 3, issueId: 'a-open2' });`;
const BODYWEIGHT = `for (let i = 0; i < 14; i++) d.dailyMetrics.push({ id: 'bw' + i, metricId: 'bodyweight', date: iso(-i * 2), value: 72.4 + ((i * 7) % 5) / 10 });`;

const resetPrefs = async (c) => {
  await c.st(`const { HOME_SECTION_IDS } = await import('/src/lib/preferences/migrate.ts');
    t.setHomeSectionOrder([...HOME_SECTION_IDS]);
    for (const s of t.homeSections) t.setHomeSectionVisible(s.id, true);
    for (const p of [...t.timerPresets]) t.deleteTimerPreset(p.id);
    t.setSimpleHome(false); t.setHomeLocation(null);`);
};
const restore = async (c) => { await resetPrefs(c); await seed(c); };
const full = async (c) => { await resetPrefs(c); await c.nav('home'); };
const closeAll = async (c) => { await c.close(); await c.close(); };

export const screens = [
  // Home, with data
  { id: 'home-full', area: 'home', pages: 4, setup: full },
  { id: 'home-details-off', area: 'home', pages: 3, setup: async (c) => {
      await c.st(`for (const id of ['readiness.confidence','readiness.breakdown','metrics.sparklines','metrics.hrvBaseline','metrics.bodyweight','today.time','today.exercises','today.load','today.missed']) t.setHomeDetail(id, false)`); await c.nav('home'); },
    teardown: async (c) => { await c.st(`for (const id of ['readiness.confidence','readiness.breakdown','metrics.sparklines','metrics.hrvBaseline','metrics.bodyweight','today.time','today.exercises','today.load','today.missed']) t.setHomeDetail(id, true)`); } },
  { id: 'home-customised', area: 'home', pages: 2, setup: async (c) => {
      await c.st(`t.setHomeSectionOrder(['weather','competition','trainingBlock','thisWeek','timer','metrics','today','crags','readiness','alerts','progress','fatigue','weekRecap','recentActivity','checklist']);
        for (const id of ['readiness','fatigue','progress','recentActivity']) t.setHomeSectionVisible(id, false);
        t.saveTimerPreset({ id: 'tp1', name: 'Repeaters 7/3', variant: 'timed', values: { sets: 6, reps: 6, timeOn: 7, timeOff: 3, timeBetweenSets: 120 }, leadIn: 5 });`);
      await c.nav('home'); }, teardown: restore },
  { id: 'home-timers', area: 'home', setup: async (c) => {
      await c.st(`for (const id of ['readiness','alerts','today','progress','crags','metrics','fatigue','thisWeek','weekRecap','trainingBlock','competition','recentActivity','weather']) t.setHomeSectionVisible(id, false);
        t.saveTimerPreset({ id: 'tp1', name: 'Repeaters 7/3', variant: 'timed', values: { sets: 6, reps: 6, timeOn: 7, timeOff: 3, timeBetweenSets: 120 }, leadIn: 5 });
        t.saveTimerPreset({ id: 'tp2', name: 'A very long timer name for the max hang protocol on the 20 mm edge', variant: 'timed', values: { sets: 5, reps: 1, timeOn: 10, timeBetweenSets: 180 }, leadIn: 10 });
        t.saveTimerPreset({ id: 'tp3', name: '4x4 pacer', variant: 'pacer', values: { sets: 4, reps: 4, timeOn: 4 }, leadIn: 5 });
        t.saveTimerPreset({ id: 'tp4', name: 'Rest 3 min', variant: 'counted', values: { sets: 1, reps: 1 }, leadIn: 0 });
        t.saveTimerPreset({ id: 'tp5', name: 'Fifth', variant: 'timed', values: { sets: 3, reps: 1, timeOn: 5 }, leadIn: 5 });`); await c.nav('home'); }, teardown: restore },
  { id: 'home-timer-sheet', area: 'home', setup: async (c) => {
      await c.st(`t.saveTimerPreset({ id: 'tp1', name: 'Repeaters 7/3', variant: 'timed', values: { sets: 6, reps: 6, timeOn: 7, timeOff: 3, timeBetweenSets: 120 }, leadIn: 5 })`);
      await c.nav('home'); const ok = await c.click('Another timer', { exact: false }); if (!ok) throw new Error('no timer button'); await sleep(600); }, teardown: async (c) => { await closeAll(c); await restore(c); } },
  { id: 'home-weather', area: 'home', setup: async (c) => {
      await c.st(`t.setHomeLocation({ name: 'Konstanz', latitude: 47.66, longitude: 9.17 })`); await c.nav('home'); await sleep(2500); }, teardown: resetPrefs },
  { id: 'home-android-card', area: 'home', setup: async (c) => {
      await c.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' });
      await c.ev(`localStorage.removeItem('boulder_tracker_android_card_dismissed')`);
      await c.send('Page.reload'); await sleep(4500); await c.st(`t.preferencesStore.setWelcomeDone(true)`); await c.nav('home'); },
    teardown: async (c) => { await c.send('Emulation.setUserAgentOverride', { userAgent: '' }); await c.send('Page.reload'); await sleep(4500); } },
  { id: 'home-android-steps', area: 'home', setup: async (c) => {
      await c.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' });
      await c.send('Page.reload'); await sleep(4500); await c.st(`t.preferencesStore.setWelcomeDone(true)`); await c.nav('home');
      await c.click('How to install it', { exact: false }); },
    teardown: async (c) => { await c.send('Emulation.setUserAgentOverride', { userAgent: '' }); await c.send('Page.reload'); await sleep(4500); } },
  { id: 'home-weekly-checkin', area: 'home', setup: async (c) => {
      await c.st(`t.setTunable('checkin.day', 1)`); await c.ev(`Object.keys(localStorage).filter(k=>/checkin/i.test(k)).forEach(k=>localStorage.removeItem(k))`);
      await c.send('Page.reload'); await sleep(4500); await c.st(`t.preferencesStore.setWelcomeDone(true)`); await c.nav('home'); },
    teardown: async (c) => { await c.st(`t.setTunable('checkin.day', 7)`); } },
  { id: 'home-pain-due', area: 'home', pages: 3, setup: async (c) => { await seed(c, OPEN_PAIN); await c.ev(`localStorage.removeItem('boulder_tracker_pain_card_dismissed')`); await c.send('Page.reload'); await sleep(4500); await c.st(`t.preferencesStore.setWelcomeDone(true)`); await c.nav('home'); }, teardown: restore },
  { id: 'home-pain-stale', area: 'home', setup: async (c) => {
      await seed(c, OPEN_PAIN + `d.painLogs = d.painLogs.map(l => l.issueId === 'a-open' ? { ...l, date: iso(-30), weekId: wk(-30) } : l);`);
      await c.ev(`localStorage.removeItem('boulder_tracker_pain_card_dismissed')`); await c.send('Page.reload'); await sleep(4500); await c.st(`t.preferencesStore.setWelcomeDone(true)`); await c.nav('home'); }, teardown: restore },
  // Home, empty / new
  { id: 'home-empty', area: 'home', pages: 3, setup: async (c) => { await seed(c, EMPTY); await c.ev(`localStorage.removeItem('boulder_tracker_checklist_dismissed')`); await c.nav('home'); }, teardown: restore },
  { id: 'home-empty-simple', area: 'home', setup: async (c) => { await seed(c, EMPTY); await c.st(`t.setSimpleHome(true)`); await c.ev(`localStorage.removeItem('boulder_tracker_checklist_dismissed')`); await c.nav('home'); }, teardown: restore },
  { id: 'home-example-data', area: 'home', pages: 3, setup: async (c) => { await seed(c, EMPTY); await c.nav('home');
      await c.st(`const { tour } = await import('/src/lib/tour/tour.svelte.ts'); await tour.startExample()`); await sleep(1500); },
    teardown: async (c) => { await c.st(`const { tour } = await import('/src/lib/tour/tour.svelte.ts'); await tour.endExample()`); await sleep(800); await restore(c); } },
  // Sheets
  { id: 'acwr-sheet', area: 'home', setup: async (c) => { await c.nav('home'); await c.st(`const { showAcwr } = await import('/src/lib/help/acwrSheet.svelte.ts'); showAcwr()`); await sleep(700); }, pages: 2 },
  { id: 'acwr-sheet-sparse', area: 'home', setup: async (c) => { await seed(c, `d.workouts = d.workouts.filter(w => w.status !== 'completed').slice(0, 5);`); await c.nav('home'); await c.st(`const { showAcwr } = await import('/src/lib/help/acwrSheet.svelte.ts'); showAcwr()`); await sleep(700); }, teardown: async (c) => { await closeAll(c); await restore(c); } },
  { id: 'taper-sheet', area: 'home', setup: async (c) => { await seed(c, `d.goals.push({ id: 'g-comp', kind: 'competition', name: 'Regional bouldering cup', date: iso(24), endDate: iso(24) });`);
      await c.nav('home'); await c.st(`const { openTaperView } = await import('/src/lib/goals/taperView.svelte.ts'); openTaperView('g-comp')`); await sleep(800); }, pages: 2, teardown: async (c) => { await closeAll(c); await restore(c); } },
  { id: 'home-next-goal', area: 'home', pages: 2, setup: async (c) => { await seed(c, `d.goals.push({ id: 'g-comp', kind: 'competition', name: 'Regional bouldering cup with a rather long official name', date: iso(24), endDate: iso(24), location: { name: 'Zurich', latitude: 47.37, longitude: 8.54 } });`); await c.nav('home'); }, teardown: restore },
  // Quick log
  { id: 'quicklog-menu', area: 'home', setup: async (c) => { await c.nav('home'); await c.click('Quick log', { exact: false }); await sleep(500); } },
  { id: 'quicklog-pain-issues', area: 'home', pages: 2, setup: async (c) => { await seed(c, OPEN_PAIN); await c.nav('home'); await c.click('Quick log', { exact: false }); await c.click('Pain', { exact: false, within: '[role=dialog]' }); await sleep(500); }, teardown: async (c) => { await closeAll(c); await restore(c); } },
  { id: 'quicklog-pain-none', area: 'home', setup: async (c) => { await c.nav('home'); await c.click('Quick log', { exact: false }); await c.click('Pain', { exact: false, within: '[role=dialog]' }); await sleep(500); } },
  { id: 'quicklog-bodyweight', area: 'home', pages: 2, setup: async (c) => { await seed(c, BODYWEIGHT); await c.nav('home'); await c.click('Quick log', { exact: false }); await c.click('Bodyweight', { exact: false, within: '[role=dialog]' }); await sleep(500); }, teardown: async (c) => { await closeAll(c); await restore(c); } },
  { id: 'quicklog-bodyweight-empty', area: 'home', setup: async (c) => { await c.nav('home'); await c.click('Quick log', { exact: false }); await c.click('Bodyweight', { exact: false, within: '[role=dialog]' }); await sleep(500); } },
  { id: 'quicklog-send', area: 'home', pages: 2, setup: async (c) => { await c.nav('home'); await c.click('Quick log', { exact: false }); await c.click('Outdoor send', { exact: false, within: '[role=dialog]' }); await sleep(500); } },
  { id: 'quicklog-test', area: 'home', pages: 2, setup: async (c) => { await c.nav('home'); await c.click('Quick log', { exact: false }); await c.click('Test result', { exact: false, within: '[role=dialog]' }); await sleep(500); } },
  // Pain screens
  { id: 'pain-report-new', area: 'home', pages: 3, setup: async (c) => { await c.nav('home'); await c.st(`const { openPainReport } = await import('/src/lib/pain/painUi.svelte.ts'); openPainReport()`); await sleep(700); } },
  { id: 'pain-report-filled', area: 'home', pages: 3, setup: async (c) => { await c.nav('home'); await c.st(`const { openPainReport } = await import('/src/lib/pain/painUi.svelte.ts'); openPainReport()`); await sleep(700);
      await c.click('Finger', { exact: false }); await c.click('Right', { exact: false }); await c.click('Sharp', { exact: false }); await c.click('During', { exact: false }); await sleep(400); } },
  { id: 'pain-issue-open', area: 'home', pages: 3, setup: async (c) => { await seed(c, OPEN_PAIN); await c.nav('home'); await c.st(`const { openPainIssue } = await import('/src/lib/pain/painUi.svelte.ts'); openPainIssue('a-open')`); await sleep(800); }, teardown: async (c) => { await c.st(`const { closePainScreens } = await import('/src/lib/pain/painUi.svelte.ts'); closePainScreens()`); await restore(c); } },
  { id: 'pain-issue-resolved', area: 'home', pages: 2, setup: async (c) => { await c.nav('home'); await c.st(`const { openPainIssue } = await import('/src/lib/pain/painUi.svelte.ts'); openPainIssue('demo-issue-1')`); await sleep(800); }, teardown: async (c) => { await c.st(`const { closePainScreens } = await import('/src/lib/pain/painUi.svelte.ts'); closePainScreens()`); } },
  { id: 'pain-issue-edit', area: 'home', pages: 3, setup: async (c) => { await seed(c, OPEN_PAIN); await c.nav('home'); await c.st(`const { openPainIssue } = await import('/src/lib/pain/painUi.svelte.ts'); openPainIssue('a-open')`); await sleep(800); await c.click('Edit', { exact: false }); await sleep(500); }, teardown: async (c) => { await c.st(`const { closePainScreens } = await import('/src/lib/pain/painUi.svelte.ts'); closePainScreens()`); await restore(c); } },
  { id: 'pain-heads-up', area: 'home', pages: 2, setup: async (c) => {
      // A session today with a finger exercise, next to an open issue that watches Fingers: the heads-up chip and line show on Home's Today card.
      await seed(c, OPEN_PAIN + `const ft = d.exerciseTypes.find(t => t.category === 'Fingers'); const base = d.workouts.find(w => w.status !== 'completed');
        d.workouts.push({ ...structuredClone(base), id: 'hu-today', date: null, status: 'planned', weekId: wk(0), dayOfWeek: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()], name: 'Finger strength', exercises: [{ id: 'hu-ex', typeId: ft.id, activeParameters: ['timeOn'], prescribed: { timeOn: 10 } }], groups: [] });`);
      await c.nav('home'); }, teardown: restore },
];

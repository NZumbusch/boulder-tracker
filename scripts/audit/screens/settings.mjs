// Settings: the index, the eight section lists, every page (by `settingsPageRequest`), and their sheets and editors
// (circuit, exercise type, phase and template editors, colour picker, place editor, PDF export, AI history picker,
// error log, full log). Run the pages in two goes with --only if wanted. The update card is the shell agent's.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Writes the example data (changed by `mutate`, which gets `d`) into storage and reloads. */
async function seed(c, mutate = '') {
  await c.st(`const url = performance.getEntriesByType('resource').map(r=>r.name).find(n=>/localforage/.test(n));
    const lf = (await import(url)).default; lf.config({ name: 'boulder-tracker', storeName: 'training_data_v2' });
    const { buildDemoData } = await import('/src/lib/tour/demoData.ts');
    const d = buildDemoData();
    ${mutate}
    for (const k of Object.keys(d)) if (k !== 'exportVersion') await lf.setItem(k, d[k]);
    await lf.setItem('database_version', d.exportVersion)`);
  await c.send('Page.reload'); await sleep(4500);
  await c.st(`t.preferencesStore.setWelcomeDone(true)`); await sleep(500);
}
const reseed = (c) => seed(c, PLACES);
const PLACES = `d.places = [{ name: 'Steinbock Konstanz', kind: 'gym', price: 'CHF 22', hours: 'Mon-Fri 9-22', notes: 'Board on the left wall' }, { name: 'Brione', kind: 'crag', latitude: 46.3, longitude: 8.8 }, { name: 'Home wall', kind: 'home', latitude: 47.66, longitude: 9.17 }];`;
/** Plenty of everything: many places and circuits, long names. */
const FULL = `${PLACES}
  for (let i = 0; i < 12; i++) d.places.push({ name: 'A crag or gym with a rather long name number ' + i, kind: i % 2 ? 'crag' : 'gym', latitude: 46 + i / 10, longitude: 8 + i / 10, notes: 'Some notes about this place that run on for a while to see how they wrap' });
  for (let i = 0; i < 10; i++) { const x = structuredClone(d.circuits[0]); x.id = 'audit-c' + i; x.name = i % 3 === 0 ? 'A circuit with an extremely long name that goes on and on ' + i : 'Circuit ' + i; d.circuits.push(x); }
  for (let i = 0; i < 12; i++) d.exerciseTypes.push({ ...structuredClone(d.exerciseTypes[0]), id: 'audit-e' + i, name: 'Custom exercise with a long name number ' + i });
  for (let i = 0; i < 6; i++) d.analyticsCategories.push({ ...structuredClone(d.analyticsCategories[0]), id: 'audit-k' + i, name: 'Category ' + i });`;

const mod = (name) => `const U_${name.replace(/\W/g, '')} = performance.getEntriesByType('resource').map(r => r.name).find(n => /${name.replace(/\./g, '\\.')}/.test(n)); const ${name.split('.')[0]} = await import(U_${name.replace(/\W/g, '')});`;
const clean = async (c) => {
  await c.st(`t.navigate('home')`);
  await sleep(500);
  for (let i = 0; i < 3; i++) if (await c.ev(`!!document.querySelector('[role=dialog]')`)) await c.close();
};
const must = async (c, text, opts) => { if (!(await c.click(text, opts))) throw new Error('no button: ' + text); await sleep(400); };
const open = async (c, id) => { await clean(c); await c.settings(id); };
const type = (c, sel, value) => c.ev(`(()=>{const i=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.getBoundingClientRect().width>0); if(!i) return false; const proto=i.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(i,${JSON.stringify(value)}); i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);

const CAL = `dc.enabled = true; dc.granted = true; dc.calendars = [{ id: '1', name: 'Personal', account: 'me@example.com', color: '#3366cc', visible: true }, { id: '2', name: 'Work calendar with a really long name that will need to wrap or cut somewhere', account: 'someone.with.a.long.address@company.example.com', color: '#cc3366', visible: true }, { id: '3', name: 'Holidays', account: 'Other', color: '#33aa66', visible: true }]; dc.selected = ['1', '2'];`;
/** Puts the Health Connect (`hc`) or phone calendar (`dc`) store into a state, with its native calls turned off. */
const fake = (c, which, js) => c.st(`${mod('healthConnect.svelte.ts')} ${mod('deviceCalendar.svelte.ts')}
  const hc = healthConnect.healthConnect, dc = deviceCalendar.deviceCalendar;
  hc.supported = true; dc.supported = true; hc.refreshStatus = async () => {}; dc.refreshStatus = async () => {};
  ${js}`);
const unfake = async (c) => { await clean(c); await c.send('Page.reload'); await sleep(4500); await c.st(`t.preferencesStore.setWelcomeDone(true)`); await sleep(400); };
const S = (id, area, setup, extra = {}) => ({ id, area, setup, teardown: clean, ...extra });

const PAGES = [
  ['exercises', 3], ['circuits', 2], ['phases', 3], ['benchmarks', 4], ['targets', 2], ['values', 3],
  ['general', 2], ['units', 1], ['home', 3], ['planCalendar', 2], ['history', 3],
  ['live', 2], ['timer', 5], ['model', 4], ['pain', 2], ['weather', 3], ['reminders', 2],
  ['coach', 3], ['aiSharing', 3], ['aiDirect', 3], ['sync', 3], ['healthConnect', 2], ['deviceCalendar', 2], ['exports', 1], ['widgets', 2], ['about', 4],
];
const SECTIONS = ['Training setup', 'App & display', 'Sessions & timer', 'Model & health', 'Reminders & nudges', 'AI & coach', 'Data & connections', 'About & Help'];

export const screens = [
  S('st-index', 'settings', async (c) => { await clean(c); await c.nav('settings'); }),
  S('st-search', 'settings', async (c) => { await clean(c); await c.nav('settings'); await type(c, 'input[type=search]', 'volume'); await sleep(400); }),
  S('st-search-none', 'settings', async (c) => { await clean(c); await c.nav('settings'); await type(c, 'input[type=search]', 'zzzz'); await sleep(400); }),
  ...SECTIONS.map((s, i) => S('st-section-' + i, 'settings', async (c) => { await clean(c); await c.nav('settings'); await must(c, s, { exact: false }); })),
  ...PAGES.map(([id, pages]) => S('st-page-' + id, 'settings', (c) => open(c, id), { pages })),

  // ---- Empty and full
  S('st-circuits-empty', 'settings', async (c) => { await seed(c, 'd.circuits = [];'); await open(c, 'circuits'); }, { teardown: async (c) => { await clean(c); await reseed(c); } }),
  S('st-circuits-full', 'settings', async (c) => { await seed(c, FULL); await open(c, 'circuits'); }, { pages: 3, teardown: async (c) => { await clean(c); await reseed(c); } }),
  S('st-exercises-full', 'settings', async (c) => { await seed(c, FULL); await open(c, 'exercises'); }, { pages: 4, teardown: async (c) => { await clean(c); await reseed(c); } }),
  S('st-places-empty', 'settings', async (c) => { await seed(c, 'd.places = [];'); await open(c, 'weather'); }, { teardown: async (c) => { await clean(c); await reseed(c); } }),
  S('st-places-full', 'settings', async (c) => { await seed(c, FULL); await open(c, 'weather'); }, { pages: 3, teardown: async (c) => { await clean(c); await reseed(c); } }),
  S('st-phases-empty', 'settings', async (c) => { await seed(c, 'd.phaseDefs = []; d.templates = {};'); await open(c, 'phases'); }, { teardown: async (c) => { await clean(c); await reseed(c); } }),
  S('st-benchmarks-empty', 'settings', async (c) => { await seed(c, 'd.benchmarkTypes = [];'); await open(c, 'benchmarks'); }, { teardown: async (c) => { await clean(c); await reseed(c); } }),

  // ---- Editors and sheets
  S('st-circuit-new', 'settings', async (c) => { await open(c, 'circuits'); await must(c, 'New circuit', { exact: false }); await sleep(400); }, { pages: 3 }),
  S('st-circuit-edit', 'settings', async (c) => { await open(c, 'circuits'); await c.ev(`document.querySelector('main button, [data-settings] button')`); await must(c, 'Core', { exact: false }); }, { pages: 3 }),
  S('st-exercise-edit', 'settings', async (c) => { await open(c, 'exercises'); await must(c, 'Fingers', { exact: false }); await c.ev(`(()=>{const b=[...document.querySelectorAll('button.group')].find(x=>x.getBoundingClientRect().width>0); b&&b.click()})()`); await sleep(600); }, { pages: 3 }),
  S('st-exercise-new', 'settings', async (c) => { await open(c, 'exercises'); await must(c, 'New exercise', { exact: false }); await sleep(400); }, { pages: 3 }),
  S('st-category-new', 'settings', async (c) => { await open(c, 'exercises'); await must(c, 'Analytics categories'); await must(c, 'Add category', { exact: false }); await sleep(400); }, { pages: 2 }),
  S('st-phase-new', 'settings', async (c) => { await open(c, 'phases'); await must(c, 'Add phase', { exact: false }); await sleep(400); }, { pages: 2 }),
  S('st-phase-edit', 'settings', async (c) => { await open(c, 'phases'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-label^="Edit"]')].find(x=>x.getBoundingClientRect().width>0); b&&b.click()})()`); await sleep(500); }, { pages: 2 }),
  S('st-phase-templates', 'settings', async (c) => { await open(c, 'phases'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-expanded]')].find(x=>x.getBoundingClientRect().width>0); b&&b.click()})()`); await sleep(600); }, { pages: 4 }),
  S('st-phase-starter', 'settings', async (c) => { await open(c, 'phases'); await c.scrollTo(1); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-expanded]')].filter(x=>x.getBoundingClientRect().width>0&&/starter|library/i.test(x.textContent)).pop(); b&&b.click()})()`); await sleep(500); await c.scrollTo(1); }, { pages: 2 }),
  S('st-place-open', 'settings', async (c) => { await open(c, 'weather'); await must(c, 'Steinbock', { exact: false }); await sleep(300); }, { pages: 2 }),
  S('st-place-add', 'settings', async (c) => { await open(c, 'weather'); await must(c, 'Add a place', { exact: false }); await sleep(300); }, { pages: 2 }),
  S('st-pdf-export', 'settings', async (c) => { await open(c, 'exports'); await must(c, 'Export PDF', { exact: false }); await sleep(600); }, { pages: 2 }),
  S('st-ai-tuning', 'settings', async (c) => { await open(c, 'aiSharing'); await c.scrollTo(1); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-expanded]')].find(x=>x.getBoundingClientRect().width>0&&/break|prompt|what/i.test(x.textContent)); b&&b.click()})()`); await sleep(500); await c.scrollTo(1); }, { pages: 2 }),
  S('st-about-new', 'settings', async (c) => { await open(c, 'about'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-expanded]')].find(x=>x.getBoundingClientRect().width>0); b&&b.click()})()`); await sleep(400); }, { pages: 3 }),
  S('st-errorlog', 'settings', async (c) => {
    await c.ev(`localStorage.setItem('boulder_tracker_error_log', JSON.stringify([
      { at: new Date().toISOString(), level: 'error', source: 'uncaught', where: 'Home', message: 'TypeError: Cannot read properties of undefined (reading "name") at a very long path that keeps going and going so it has to wrap somewhere sensible', stack: 'TypeError: x\\n    at foo (http://localhost/src/a.ts:1:1)\\n    at bar (http://localhost/src/b.ts:2:2)', count: 3 },
      { at: new Date(Date.now() - 3600e3).toISOString(), level: 'warning', source: 'console', message: 'Short warning' },
      ...Array.from({ length: 12 }, (_, i) => ({ at: new Date(Date.now() - (i + 2) * 7200e3).toISOString(), level: i % 2 ? 'warning' : 'error', source: 'promise', message: 'Entry number ' + i + ' of the log' }))]))`);
    await open(c, 'about'); await c.scrollTo(1); await sleep(300);
  }, { pages: 3, teardown: async (c) => { await c.ev(`localStorage.removeItem('boulder_tracker_error_log')`); await clean(c); } }),
  S('st-errorlog-open', 'settings', async (c) => {
    await c.ev(`localStorage.setItem('boulder_tracker_error_log', JSON.stringify([{ at: new Date().toISOString(), level: 'error', source: 'uncaught', where: 'Home', message: 'TypeError: Cannot read properties of undefined (reading "name") at a very long path that keeps going', stack: 'TypeError: x\\n    at foo (http://localhost/src/a.ts:1:1)\\n    at bar (http://localhost/src/b.ts:2:2)', count: 3 }]))`);
    await open(c, 'about'); await c.scrollTo(1); await sleep(300);
    await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-expanded]')].filter(x=>x.getBoundingClientRect().width>0&&/TypeError/.test(x.textContent))[0]; b&&b.click()})()`); await sleep(400);
  }, { pages: 2, teardown: async (c) => { await c.ev(`localStorage.removeItem('boulder_tracker_error_log')`); await clean(c); } }),
  S('st-fulllog', 'settings', async (c) => {
    await c.ev(`localStorage.setItem('boulder_tracker_console_log', JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ at: new Date(Date.now() - i * 60e3).toISOString(), level: ['log','info','warning','error','debug'][i % 5], message: 'Console line ' + i + ' with some text that is long enough to wrap onto a second line on a narrow phone screen' }))))`);
    await open(c, 'about'); await c.scrollTo(1); await sleep(300);
    await must(c, 'Full log', { exact: false }); await sleep(500);
  }, { pages: 2, teardown: async (c) => { await c.close(); await c.ev(`localStorage.removeItem('boulder_tracker_console_log')`); await clean(c); } }),
  // LocationEditor lives in the Plan goal form (and Welcome).
  S('st-location-editor', 'settings', async (c) => { await c.ev(`localStorage.setItem('plan.view', 'blocks'); localStorage.setItem('plan.calendarMode', 'week')`); await clean(c); await c.nav('plan'); await sleep(600); await must(c, 'Add outdoor trip', { exact: false }); await sleep(600); await c.click('Add', { exact: true }); await sleep(400); }, { pages: 2 }),
  // ---- Native-only pages, faked: a browser has no Health Connect or phone calendar, so the stores are put into each state by hand.
  S('st-health-off', 'settings', async (c) => { await fake(c, 'hc', `hc.availability = 'available'; hc.enabled = false; hc.granted = [];`); await open(c, 'healthConnect'); }, { teardown: unfake }),
  S('st-health-on', 'settings', async (c) => { await fake(c, 'hc', `hc.availability = 'available'; hc.enabled = true; hc.granted = ['restingHeartRate','weight','sleep']; hc.history = true; hc.lastImportAt = Date.now() - 3600e3; hc.lastResult = { saved: 12, keptManual: 3 };`); await open(c, 'healthConnect'); }, { pages: 2, teardown: unfake }),
  S('st-health-error', 'settings', async (c) => { await fake(c, 'hc', `hc.availability = 'available'; hc.enabled = true; hc.granted = ['weight']; hc.error = 'Permission was revoked in Health Connect, so nothing could be read. Open Health Connect and allow it again.';`); await open(c, 'healthConnect'); }, { pages: 2, teardown: unfake }),
  S('st-health-missing', 'settings', async (c) => { await fake(c, 'hc', `hc.availability = 'notInstalled';`); await open(c, 'healthConnect'); }, { teardown: unfake }),
  S('st-calendar-off', 'settings', async (c) => { await fake(c, 'dc', `dc.enabled = false; dc.granted = false;`); await open(c, 'deviceCalendar'); }, { teardown: unfake }),
  S('st-calendar-on', 'settings', async (c) => { await fake(c, 'dc', CAL); await open(c, 'deviceCalendar'); }, { pages: 2, teardown: unfake }),
  S('st-calendar-colour', 'settings', async (c) => { await fake(c, 'dc', CAL); await open(c, 'deviceCalendar'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-label*="olour"],button[aria-label*="olor"],button[aria-expanded]')].find(x=>x.getBoundingClientRect().width>0); b&&b.click()})()`); await sleep(400); }, { pages: 2, teardown: unfake }),
];

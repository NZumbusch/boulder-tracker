// History-sends: History (sessions list, filters, detail, share image), the Sends tab (log, form, import, grade chart),
// plus the common widgets that only appear in context: NoteSheet, BenchmarkForm, PullToRefresh (Home and History), RangeSlider.
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
const NO_SENDS = `d.outdoorAscents = [];`;
const NO_HISTORY = `d.workouts = d.workouts.filter(w => w.status !== 'completed');`;
const NOTHING = NO_SENDS + NO_HISTORY;
/** Plenty of everything: 130 completed sessions (cloned, with long names), 70 sends over several trips and months, with long names and crags. */
const FULL_DATA = `
  const done = d.workouts.filter(w => w.status === 'completed');
  const extra = [];
  for (let i = 0; i < 130; i++) { const src = done[i % done.length]; const w = JSON.parse(JSON.stringify(src)); const dt = new Date(); dt.setDate(dt.getDate() - 2 - i * 2); w.id = 'audit-w' + i; w.date = dt.toISOString(); w.notes = i % 7 === 0 ? 'Very long session name that goes on and on to see how the row copes with it at narrow widths' : (src.notes || 'Session ' + i); extra.push(w); }
  d.workouts = d.workouts.concat(extra);
  const grades = ['5C','6A','6A+','6B','6B+','6C','6C+','7A','7A+','7B','7B+','8A'];
  const styles = ['Flash','Onsight','Redpoint'];
  const crags = ['Fontainebleau','Magic Wood','Local crag','Rocklands','Chironico with a really long area name here'];
  for (let i = 0; i < 70; i++) d.outdoorAscents.push({ id: 'audit-s' + i, date: iso(-3 - i * 6), name: i % 9 === 0 ? 'An extremely long problem name that will not fit on a phone row in one line' : 'Problem ' + i, grade: grades[(i * 5) % grades.length], style: styles[i % 3], crag: crags[i % crags.length] });
`;
const reseed = (c) => seed(c);

const mod = (name) => `const U_${name.replace(/\W/g, '')} = performance.getEntriesByType('resource').map(r => r.name).find(n => /${name.replace(/\./g, '\\.')}/.test(n)); const ${name.split('.')[0]} = await import(U_${name.replace(/\W/g, '')});`;
const clean = async (c) => {
  await c.st(`${mod('workoutModal.svelte.ts')} workoutModal.closeWorkout(); t.uiStore.historyTab = 'sessions'; t.uiStore.historyFocusId = null; t.navigate('home')`);
  await sleep(500);
  for (let i = 0; i < 3; i++) if (await c.ev(`!!document.querySelector('[role=dialog]')`)) await c.close();
};
const must = async (c, text, opts) => { if (!(await c.click(text, opts))) throw new Error('no button: ' + text); await sleep(400); };
const history = async (c, tab = 'sessions') => { await clean(c); await c.st(`t.uiStore.historyTab = '${tab}'`); await c.nav('history'); await sleep(400); };
const COMPLETED = `JSON.parse(JSON.stringify(t.workouts.find(x => x.status === 'completed' && x.exercises.length > 2)))`;
/** Opens a completed session from History's list, as a tap on its row does. */
const openWorkout = async (c, name = 'Dynamic Moves') => { await history(c); await must(c, name, { exact: false }); await sleep(700); };
/** Types into the first visible input/textarea matching `sel`. */
const type = (c, sel, value) => c.ev(`(()=>{const i=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.getBoundingClientRect().width>0); if(!i) return false; const proto=i.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(i,${JSON.stringify(value)}); i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);

const CSV = `route_boulder,name,location_name,sector_name,area_name,country_code,date,type,sub_type,rating,project,tries,repeats,difficulty,perceived_hardness,comment,height,recommended,sits
1,La Marie-Rose,Fontainebleau,Cuvier,Fontainebleau,FR,2024-04-02,f,,6A,0,1,0,6A,0,Nice,0,1,0
1,Brand new problem,Magic Wood,Riverside,Magic Wood,CH,2024-05-02,r,,7A,0,5,0,7A,0,,0,1,0
1,Another one with a rather long name to check wrapping,Rocklands,Sector,Rocklands,ZA,2024-05-03,os,,6C+,0,1,0,6C,0,,0,1,0
1,Arête,Local crag,,,CH,${(() => { const x = new Date(); x.setDate(x.getDate() - 30); return x.toISOString().slice(0, 10); })()},f,,6C+,0,1,0,6C+,0,,0,1,0
1,Dyno,Local crag,,,CH,not-a-date,r,,6B,0,3,0,6B,0,,0,1,0`;
const importScreen = async (c, withFile) => {
  await history(c, 'sends'); await must(c, 'Import from 8a.nu', { exact: false });
  if (withFile) {
    await c.ev(`(()=>{const i=document.querySelector('input[type=file]'); const dt=new DataTransfer(); dt.items.add(new File([${JSON.stringify(CSV)}],'8anu-export.csv',{type:'text/csv'})); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await sleep(900);
  }
};

export const screens = [
  // ---- History: sessions
  { id: 'hs-history', area: 'history-sends', pages: 3, setup: (c) => history(c), teardown: clean },
  { id: 'hs-history-empty', area: 'history-sends', setup: async (c) => { await seed(c, NO_HISTORY); await history(c); }, teardown: async (c) => { await clean(c); await reseed(c); } },
  { id: 'hs-history-full', area: 'history-sends', pages: 3, setup: async (c) => { await seed(c, FULL_DATA); await history(c); }, teardown: async (c) => { await clean(c); await reseed(c); } },
  { id: 'hs-history-more', area: 'history-sends', pages: 2, setup: async (c) => { await seed(c, FULL_DATA); await history(c); await c.scrollTo(1); await sleep(300); await c.click('Show more', { exact: false }); await sleep(500); await c.scrollTo(1); }, teardown: async (c) => { await clean(c); await reseed(c); } },
  { id: 'hs-history-filters', area: 'history-sends', pages: 2, setup: async (c) => { await history(c); await must(c, 'Filters', { exact: false }); await sleep(400); }, teardown: clean },
  { id: 'hs-history-filtered', area: 'history-sends', setup: async (c) => { await history(c); await must(c, 'Filters', { exact: false }); await type(c, 'input[placeholder="Name or notes"]', 'zzzz-nothing'); await sleep(500); }, teardown: clean },
  { id: 'hs-history-chips', area: 'history-sends', setup: async (c) => { await history(c); await must(c, 'Filters', { exact: false }); await type(c, 'input[placeholder="Name or notes"]', 'a'); await c.ev(`(()=>{const i=[...document.querySelectorAll('input[type=date]')][0]; if(i){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'2020-01-01'); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true}))}})()`); await sleep(300); await c.click('Filters', { exact: false }); await sleep(500); }, teardown: clean },
  { id: 'hs-history-detail', area: 'history-sends', pages: 3, setup: (c) => openWorkout(c), teardown: clean },
  { id: 'hs-history-menu', area: 'history-sends', setup: async (c) => { await openWorkout(c); await must(c, 'More actions'); }, teardown: clean },
  { id: 'hs-share-image', area: 'history-sends', pages: 2, setup: async (c) => { await openWorkout(c); await must(c, 'More actions'); await must(c, 'Share', { exact: false }); await sleep(1200); }, teardown: async (c) => { await c.close(); await clean(c); } },
  { id: 'hs-share-image-detailed', area: 'history-sends', pages: 2, setup: async (c) => { await openWorkout(c); await must(c, 'More actions'); await must(c, 'Share', { exact: false }); await sleep(800); await c.ev(`(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.getBoundingClientRect().width>0&&/detailed/i.test(x.textContent+x.getAttribute('aria-label')))[0]; b&&b.click()})()`); await sleep(800); }, teardown: async (c) => { await c.close(); await clean(c); } },
  { id: 'hs-share-image-stats', area: 'history-sends', pages: 2, setup: async (c) => { await openWorkout(c); await must(c, 'More actions'); await must(c, 'Share', { exact: false }); await sleep(800); await c.ev(`(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.getBoundingClientRect().width>0&&/stats/i.test(x.textContent+x.getAttribute('aria-label')))[0]; b&&b.click()})()`); await sleep(800); }, teardown: async (c) => { await c.close(); await clean(c); } },

  // ---- Sends
  { id: 'hs-sends', area: 'history-sends', pages: 3, setup: (c) => history(c, 'sends'), teardown: clean },
  { id: 'hs-sends-empty', area: 'history-sends', setup: async (c) => { await seed(c, NO_SENDS); await history(c, 'sends'); }, teardown: async (c) => { await clean(c); await reseed(c); } },
  { id: 'hs-sends-full', area: 'history-sends', pages: 4, setup: async (c) => { await seed(c, FULL_DATA); await history(c, 'sends'); }, teardown: async (c) => { await clean(c); await reseed(c); } },
  { id: 'hs-sends-grade-picked', area: 'history-sends', pages: 2, setup: async (c) => { await seed(c, FULL_DATA); await history(c, 'sends'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-pressed], svg [role=button], [role=button]')].filter(x=>x.getBoundingClientRect().width>0&&/7A|6B/.test(x.getAttribute('aria-label')||x.textContent))[0]; b&&b.dispatchEvent(new MouseEvent('click',{bubbles:true}))})()`); await sleep(500); }, teardown: async (c) => { await clean(c); await reseed(c); } },
  { id: 'hs-sends-year', area: 'history-sends', pages: 2, setup: async (c) => { await history(c, 'sends'); await c.click('12 months', { exact: false }); await c.click('Year', { exact: false }); await sleep(500); }, teardown: clean },
  { id: 'hs-sends-v-scale', area: 'history-sends', pages: 2, setup: async (c) => { await history(c, 'sends'); await c.st(`t.setUnit('grades', 'v')`); await sleep(600); }, teardown: async (c) => { await c.st(`t.setUnit('grades', 'font')`); await clean(c); } },
  { id: 'hs-sends-filters', area: 'history-sends', pages: 2, setup: async (c) => { await history(c, 'sends'); await must(c, 'Filters', { exact: false }); await sleep(400); }, teardown: clean },
  { id: 'hs-sends-filtered-none', area: 'history-sends', setup: async (c) => { await history(c, 'sends'); await must(c, 'Filters', { exact: false }); await type(c, 'input[placeholder="Name or notes"]', 'zzzz-nothing'); await sleep(500); }, teardown: clean },
  { id: 'hs-send-form', area: 'history-sends', pages: 2, setup: async (c) => { await history(c, 'sends'); await must(c, 'Add send', { exact: false }); }, teardown: clean },
  { id: 'hs-send-form-empty-first', area: 'history-sends', setup: async (c) => { await seed(c, NO_SENDS); await history(c, 'sends'); await must(c, 'Add your first send', { exact: false }); }, teardown: async (c) => { await clean(c); await reseed(c); } },
  { id: 'hs-send-form-filled', area: 'history-sends', pages: 2, setup: async (c) => { await history(c, 'sends'); await must(c, 'Add send', { exact: false }); await type(c, 'input[placeholder="e.g. The Wave"]', 'A long problem name to see how the field behaves when it is full'); await must(c, 'Flash'); await sleep(300); }, teardown: clean },
  { id: 'hs-send-edit', area: 'history-sends', pages: 2, setup: async (c) => { await history(c, 'sends'); await must(c, 'Arête', { exact: false }); await sleep(400); }, teardown: clean },
  { id: 'hs-send-import', area: 'history-sends', setup: (c) => importScreen(c, false), teardown: clean },
  { id: 'hs-send-import-review', area: 'history-sends', pages: 3, setup: (c) => importScreen(c, true), teardown: clean },
  { id: 'hs-send-import-edit', area: 'history-sends', pages: 3, setup: async (c) => { await importScreen(c, true); await must(c, 'Edit before importing'); await sleep(400); }, teardown: clean },

  // ---- Common widgets in context
  { id: 'hs-quicklog', area: 'history-sends', setup: async (c) => { await clean(c); await c.st(`t.uiStore.quickLogAction = null; t.uiStore.homeRequest = 'quickLog'`); await sleep(900); }, teardown: clean },
  { id: 'hs-quicklog-send', area: 'history-sends', pages: 2, setup: async (c) => { await clean(c); await c.st(`t.uiStore.quickLogAction = 'send'; t.uiStore.homeRequest = 'quickLog'`); await sleep(900); }, teardown: clean },
  { id: 'hs-benchmark-form', area: 'history-sends', pages: 2, setup: async (c) => { await clean(c); await c.st(`t.uiStore.quickLogAction = 'benchmark'; t.uiStore.homeRequest = 'quickLog'`); await sleep(900); }, teardown: clean },
  { id: 'hs-note-sheet', area: 'history-sends', setup: async (c) => { await clean(c); await c.st(`t.preferencesStore.setHomeDetail && t.preferencesStore.setHomeDetail('thisWeek.note', true)`); await sleep(300); if (!(await c.click('Add a week note', { exact: false }))) await c.click('Open week note', { exact: false }); await sleep(600); }, teardown: clean },
  { id: 'hs-note-sheet-filled', area: 'history-sends', setup: async (c) => { await clean(c); await c.st(`await t.saveWeekNote(t.currentWeekId, 'Travelled all week, slept badly, skin was thin. A longer note to see how the sheet behaves with several lines of text in it. '.repeat(4))`); await sleep(500); if (!(await c.click('Open week note', { exact: false }))) await c.click('Add a week note', { exact: false }); await sleep(600); }, teardown: async (c) => { await c.close(); await c.st(`await t.saveWeekNote(t.currentWeekId, '')`); await clean(c); } },
  // A finger pulled down on Home and held: the pull indicator (PullToRefresh) mid-drag.
  { id: 'hs-pull-home', area: 'history-sends', setup: async (c) => { await clean(c); await sleep(300); await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 120 }] }); for (const y of [150, 190, 230, 260]) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y }] }); await sleep(60); } }, teardown: async (c) => { await c.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {}); await clean(c); } },
];

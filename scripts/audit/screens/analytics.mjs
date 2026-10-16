// Analytics: the four tabs (each with its "More charts" fold), every panel, the week detail, block review and exercise progress
// sheets, empty / low-data / full data states, other ranges and window offsets, hidden sections.
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
const reseed = (c) => seed(c);
const NOTHING = `d.workouts = []; d.outdoorAscents = []; d.benchmarks = []; d.painIssues = []; d.painLogs = []; d.dailyMetrics = [];`;
/** Logged weights on the first two exercises of every completed session, so the Progress tab's exercise list and the progress sheet have trends. */
const LOGGED = `
  const dn = d.workouts.filter(w => w.status === 'completed').sort((a, b) => a.date < b.date ? -1 : 1);
  dn.forEach((w, i) => { w.exercises.slice(0, 2).forEach((e, k) => { e.logged = { ...(e.logged || {}), sets: 3, reps: [8, 8, 7 + (i % 3)], weight: 10 + k * 5 + Math.floor(i / 2) * 2.5 }; }); });
`;
/** One completed session this week and nothing else. */
const LOW = `const one = d.workouts.filter(w => w.status === 'completed').slice(-1); d.workouts = one; d.outdoorAscents = d.outdoorAscents.slice(0, 1); d.benchmarks = d.benchmarks.slice(0, 1); d.painIssues = [];`;
/** A year of sessions with long exercise names, many sends and many tests. */
const FULL = LOGGED + `
  const done = d.workouts.filter(w => w.status === 'completed');
  const extra = [];
  for (let i = 0; i < 160; i++) { const src = done[i % done.length]; const w = JSON.parse(JSON.stringify(src)); const dt = new Date(); dt.setDate(dt.getDate() - 1 - i * 2); w.id = 'audit-w' + i; w.date = dt.toISOString(); extra.push(w); }
  d.workouts = d.workouts.concat(extra);
  d.exerciseTypes.slice(0, 6).forEach((e, i) => { e.name = e.name + ' with a very long descriptive suffix number ' + i; });
  const grades = ['5C','6A','6A+','6B','6B+','6C','6C+','7A','7A+','7B','7B+','8A'];
  for (let i = 0; i < 70; i++) d.outdoorAscents.push({ id: 'audit-s' + i, date: iso(-3 - i * 5), name: 'Problem ' + i, grade: grades[(i * 5) % grades.length], style: ['Flash','Onsight','Redpoint'][i % 3], crag: 'Magic Wood' });
`;

const mod = (name) => `const U = performance.getEntriesByType('resource').map(r => r.name).find(n => /${name.replace(/\./g, '\\.')}/.test(n)); const m = await import(U);`;
const clean = async (c) => {
  await c.st(`${mod('workoutModal.svelte.ts')} m.closeWorkout(); t.navigate('home')`);
  await sleep(400);
  for (let i = 0; i < 3; i++) if (await c.ev(`!!document.querySelector('[role=dialog]')`)) await c.close();
};
const must = async (c, text, opts) => { if (!(await c.click(text, opts))) throw new Error('no button: ' + text); await sleep(400); };
/** Opens Analytics on a tab, with the "More charts" fold open or shut, range 3M. */
const analytics = async (c, tab = 'Overview', { more = false, range = '3M' } = {}) => {
  await clean(c);
  await c.nav('analytics');
  await c.click(range); await sleep(300);
  await c.ev(`(()=>{const b=[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()===${JSON.stringify(tab)}); b&&b.click()})()`); await sleep(500);
  const open = await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-expanded]')].find(e=>/More charts/.test(e.textContent)); return b ? b.getAttribute('aria-expanded')==='true' : null})()`);
  if (open !== null && open !== more) await c.click('More charts', { exact: false });
  await sleep(500);
};
/** A finger tap on the n-th chart (role=application) at a fraction of its width. */
const tapChart = (c, n, frac, fy = 0.5) => c.ev(`(()=>{const el=[...document.querySelectorAll('[role=application]')].filter(e=>e.getBoundingClientRect().width>0)[${n}]; if(!el) return false; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); const o={bubbles:true,pointerType:'touch',pointerId:7,isPrimary:true,clientX:r.left+r.width*${frac},clientY:r.top+r.height*${fy},button:0}; el.dispatchEvent(new PointerEvent('pointerdown',o)); el.dispatchEvent(new PointerEvent('pointerup',o)); return true})()`).then(async (ok) => { await sleep(500); return ok; });
const clean2 = async (c) => { await clean(c); };
const reset = async (c) => { await clean(c); await reseed(c); };

const tabScreen = (id, tab, more, pages = 4) => ({ id, area: 'analytics', pages, setup: (c) => analytics(c, tab, { more }), teardown: clean });

export const screens = [
  // ---- The four tabs, "More charts" shut and open
  tabScreen('an-overview', 'Overview', false, 4),
  tabScreen('an-training', 'Training', false, 3),
  tabScreen('an-training-more', 'Training', true, 4),
  tabScreen('an-recovery', 'Recovery', false, 4),
  tabScreen('an-progress', 'Progress', false, 4),

  // ---- Data states
  { id: 'an-almost-empty', area: 'analytics', pages: 3, setup: async (c) => { await seed(c, `d.workouts = []; d.outdoorAscents = []; d.benchmarks = []; d.painIssues = [];`); await clean(c); await c.nav('analytics'); }, teardown: reset },
  { id: 'an-empty', area: 'analytics', setup: async (c) => { await seed(c, NOTHING); await clean(c); await c.nav('analytics'); }, teardown: reset },
  { id: 'an-low-overview', area: 'analytics', pages: 2, setup: async (c) => { await seed(c, LOW); await analytics(c, 'Overview'); }, teardown: reset },
  { id: 'an-low-training', area: 'analytics', pages: 2, setup: async (c) => { await seed(c, LOW); await analytics(c, 'Training', { more: true }); }, teardown: reset },
  { id: 'an-low-recovery', area: 'analytics', pages: 2, setup: async (c) => { await seed(c, LOW); await analytics(c, 'Recovery'); }, teardown: reset },
  { id: 'an-low-progress', area: 'analytics', pages: 2, setup: async (c) => { await seed(c, LOW); await analytics(c, 'Progress'); }, teardown: reset },
  { id: 'an-full-overview', area: 'analytics', pages: 4, setup: async (c) => { await seed(c, FULL); await analytics(c, 'Overview'); }, teardown: reset },
  { id: 'an-full-progress', area: 'analytics', pages: 4, setup: async (c) => { await seed(c, FULL); await analytics(c, 'Progress'); }, teardown: reset },
  { id: 'an-full-year', area: 'analytics', pages: 4, setup: async (c) => { await seed(c, FULL); await analytics(c, 'Overview', { range: '1Y' }); }, teardown: reset },
  { id: 'an-full-year-training', area: 'analytics', pages: 4, setup: async (c) => { await seed(c, FULL); await analytics(c, 'Training', { range: '1Y', more: true }); }, teardown: reset },

  // ---- Ranges and window paging
  { id: 'an-range-4w', area: 'analytics', pages: 3, setup: (c) => analytics(c, 'Overview', { range: '4W' }), teardown: clean },
  { id: 'an-range-6m', area: 'analytics', pages: 3, setup: (c) => analytics(c, 'Overview', { range: '6M' }), teardown: clean },
  { id: 'an-range-year', area: 'analytics', pages: 3, setup: (c) => analytics(c, 'Overview', { range: '1Y' }), teardown: clean },
  { id: 'an-range-year-recovery', area: 'analytics', pages: 4, setup: (c) => analytics(c, 'Recovery', { range: '1Y' }), teardown: clean },
  { id: 'an-paged-back', area: 'analytics', pages: 3, setup: async (c) => { await analytics(c, 'Overview'); await must(c, 'Previous', { exact: false }); await must(c, 'Previous', { exact: false }); }, teardown: clean },

  // ---- Interaction inside panels
  { id: 'an-load-readout', area: 'analytics', pages: 2, setup: async (c) => { await analytics(c, 'Overview'); await tapChart(c, 0, 0.8); }, teardown: clean },
  { id: 'an-week-detail', area: 'analytics', pages: 3, setup: async (c) => { await analytics(c, 'Overview'); await tapChart(c, 0, 0.8); await must(c, 'Details'); await sleep(500); }, teardown: clean },
  { id: 'an-week-detail-year', area: 'analytics', pages: 3, setup: async (c) => { await analytics(c, 'Overview', { range: '1Y' }); await tapChart(c, 0, 0.9); await must(c, 'Details'); await sleep(500); }, teardown: clean },
  { id: 'an-heatmap-tap', area: 'analytics', pages: 2, setup: async (c) => { await analytics(c, 'Overview'); await tapChart(c, 1, 0.7, 0.4); }, teardown: clean },
  { id: 'an-strain-tap', area: 'analytics', pages: 2, setup: async (c) => { await analytics(c, 'Training', { more: true }); await tapChart(c, 1, 0.7); }, teardown: clean },
  { id: 'an-recovery-toggle', area: 'analytics', pages: 3, setup: async (c) => { await analytics(c, 'Recovery'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-pressed]')].filter(e=>e.getBoundingClientRect().width>0)[0]; b&&b.click()})()`); await sleep(500); }, teardown: clean },
  { id: 'an-recovery-tap', area: 'analytics', pages: 3, setup: async (c) => { await analytics(c, 'Recovery'); await tapChart(c, 0, 0.6); }, teardown: clean },
  { id: 'an-mix-toggle', area: 'analytics', pages: 2, setup: async (c) => { await analytics(c, 'Training'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-pressed]')].filter(e=>e.getBoundingClientRect().width>0)[0]; b&&b.click()})()`); await sleep(500); }, teardown: clean },
  { id: 'an-benchmark-adjust', area: 'analytics', pages: 3, setup: async (c) => { await analytics(c, 'Progress'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-expanded]')].find(e=>!/More charts/.test(e.textContent)&&e.getBoundingClientRect().width>0); b&&b.click()})()`); await sleep(500); }, teardown: clean },
  { id: 'an-benchmark-saveview', area: 'analytics', pages: 3, setup: async (c) => { await analytics(c, 'Progress'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-expanded]')].find(e=>!/More charts/.test(e.textContent)&&e.getBoundingClientRect().width>0); b&&b.click()})()`); await sleep(400); await c.click('Save as new view', { exact: false }); await sleep(400); }, teardown: clean },
  { id: 'an-pain-tap', area: 'analytics', pages: 2, setup: async (c) => { await analytics(c, 'Recovery'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button[aria-label*="severity"]')].find(e=>e.getBoundingClientRect().width>0); if(!b) return; b.scrollIntoView({block:'center'}); b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}))})()`); await sleep(500); }, teardown: clean },
  { id: 'an-progress-show-all', area: 'analytics', pages: 3, setup: async (c) => { await seed(c, FULL); await analytics(c, 'Progress'); await c.click('Show all', { exact: false }); await sleep(400); }, teardown: reset },

  // ---- Sheets
  { id: 'an-block-review', area: 'analytics', pages: 3, setup: async (c) => { await analytics(c, 'Overview'); await c.st(`${mod('blockReview.svelte.ts')} const b = t.trainingBlocks.find(b => b.status !== 'planned') ?? t.trainingBlocks[0]; m.openBlockReview(b.id)`); await sleep(700); }, teardown: async (c) => { await c.st(`${mod('blockReview.svelte.ts')} m.blockReviewState.blockId = null`); await clean(c); } },
  { id: 'an-exercise-progress', area: 'analytics', pages: 3, setup: async (c) => { await seed(c, LOGGED); await analytics(c, 'Progress'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>/sessions/.test(e.textContent)&&e.getBoundingClientRect().width>0); b&&b.click()})()`); await sleep(700); }, teardown: async (c) => { await c.st(`${mod('exerciseProgress.svelte.ts')} m.exerciseProgressState.typeId = null`); await clean(c); await reseed(c); } },
  { id: 'an-exercise-progress-long', area: 'analytics', pages: 3, setup: async (c) => { await seed(c, FULL); await analytics(c, 'Progress'); await c.ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>/with a very long/.test(e.textContent)&&e.getBoundingClientRect().width>0); b&&b.click()})()`); await sleep(700); }, teardown: async (c) => { await c.st(`${mod('exerciseProgress.svelte.ts')} m.exerciseProgressState.typeId = null`); await clean(c); await reseed(c); } },

  // ---- Sections turned off
  { id: 'an-sections-off', area: 'analytics', setup: async (c) => { await clean(c); await c.st(`for (const s of t.analyticsSections) t.setListVisible('analyticsSections', s.id, false)`); await c.nav('analytics'); await c.ev(`[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()==='Recovery')?.click()`); await sleep(500); }, teardown: async (c) => { await c.st(`for (const s of t.analyticsSections) t.setListVisible('analyticsSections', s.id, true)`); await clean(c); } },
];

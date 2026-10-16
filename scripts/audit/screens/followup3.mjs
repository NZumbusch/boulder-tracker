// Follow-up round, part 3: History fatigue letters + legend, Home folded cards, Plan week patterns / legend filter /
// Goals card setting, Analytics hidden findings / planned load outlines / export in the menu, Settings names.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function plan(c, { view = 'blocks', mode = 'month' } = {}) {
  await c.ev(`localStorage.setItem('plan.view', ${JSON.stringify(view)}); localStorage.setItem('plan.calendarMode', ${JSON.stringify(mode)})`);
  await c.st(`t.navigate('home')`); await sleep(500);
  await c.nav('plan'); await sleep(700);
}

export const screens = [
  { id: 'history-fatigue', area: 'followup3', setup: async (c) => { await c.nav('history'); } },
  { id: 'home-folded', area: 'followup3', setup: async (c) => {
      await c.nav('home'); await c.st(`t.setHomeCollapsed('metrics', true); t.setHomeCollapsed('thisWeek', true); t.setHomeCollapsed('fatigue', true)`); await sleep(500);
    }, teardown: async (c) => { await c.st(`for (const id of ['metrics','thisWeek','fatigue']) t.setHomeCollapsed(id, false)`); await c.close(); } },
  { id: 'home-open', area: 'followup3', setup: async (c) => { await c.nav('home'); } },
  { id: 'plan-weeks-patterns', area: 'followup3', setup: async (c) => { await c.st(`t.setTunable('plan.weekPatterns', true)`); await plan(c, { view: 'blocks' }); }, teardown: async (c) => { await c.st(`t.setTunable('plan.weekPatterns', false)`); await c.close(); } },
  { id: 'plan-weeks-filter', area: 'followup3', setup: async (c) => {
      await c.st(`t.setTunable('plan.weekPatterns', true)`); await plan(c, { view: 'blocks' });
      await c.ev(`document.querySelector('[aria-label^="Phases: tap"] button')?.click()`); await sleep(500);
    }, teardown: async (c) => { await c.st(`t.setTunable('plan.weekPatterns', false)`); await c.close(); } },
  { id: 'plan-calendar-goals-on', area: 'followup3', setup: async (c) => { await plan(c, { view: 'calendar', mode: 'month' }); await c.scrollTo(1, 'main'); } },
  { id: 'plan-calendar-goals-off', area: 'followup3', setup: async (c) => { await c.st(`t.setTunable('plan.goalsInCalendar', false)`); await plan(c, { view: 'calendar', mode: 'month' }); await c.scrollTo(1, 'main'); }, teardown: async (c) => { await c.st(`t.setTunable('plan.goalsInCalendar', true)`); await c.close(); } },
  { id: 'plan-goal-form', area: 'followup3', setup: async (c) => { await plan(c, { view: 'blocks' }); await c.click('Add competition'); await sleep(500); await c.scrollTo(1); } },
  { id: 'analytics-menu', area: 'followup3', setup: async (c) => { await c.nav('analytics'); await c.click('More actions'); await sleep(400); }, teardown: async (c) => { await c.close(); await c.ev(`document.body.click()`); } },
  { id: 'analytics-finding-hide', area: 'followup3', setup: async (c) => { await c.st(`t.setFindingHidden(null, false)`); await c.nav('analytics'); await sleep(500); } },
  { id: 'analytics-hidden-menu', area: 'followup3', setup: async (c) => {
      await c.nav('analytics'); await c.ev(`document.querySelector('button[aria-label^="Hide this finding"]')?.click()`); await sleep(600);
      await c.click('More actions'); await sleep(400);
    }, teardown: async (c) => { await c.st(`t.setFindingHidden(null, false)`); await c.close(); } },
  { id: 'analytics-hidden-sheet', area: 'followup3', setup: async (c) => {
      await c.nav('analytics'); await c.ev(`document.querySelector('button[aria-label^="Hide this finding"]')?.click()`); await sleep(600);
      await c.click('More actions'); await sleep(300); await c.click('Hidden findings', { exact: false }); await sleep(600);
    }, teardown: async (c) => { await c.st(`t.setFindingHidden(null, false)`); await c.close(); } },
  { id: 'analytics-load-outlines', area: 'followup3', setup: async (c) => { await c.nav('analytics'); await c.ev(`document.getElementById('section-load')?.scrollIntoView()`); await sleep(500); } },
  { id: 'analytics-load-no-outlines', area: 'followup3', setup: async (c) => { await c.st(`t.setTunable('analytics.plannedOutline', false)`); await c.nav('analytics'); await c.ev(`document.getElementById('section-load')?.scrollIntoView()`); await sleep(500); }, teardown: async (c) => { await c.st(`t.setTunable('analytics.plannedOutline', true)`); await c.close(); } },
  { id: 'settings-history-analytics', area: 'followup3', setup: async (c) => { await c.settings('history'); }, pages: 2 },
  { id: 'settings-home-sections', area: 'followup3', setup: async (c) => { await c.settings('home'); } },
];

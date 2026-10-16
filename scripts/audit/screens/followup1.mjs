// Follow-up round, part 1: Log a past session (History + Plan entries, sheet, editor), the 12-hour clock in the
// calendar, the new Settings entries (fatigue reminder switch, 12-hour clock, Restore previous, AI sharing badges).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mod = (name) => `const U_${name.replace(/\W/g, '')} = performance.getEntriesByType('resource').map(r => r.name).find(n => /${name.replace(/\./g, '\\.')}/.test(n)); const ${name.split('.')[0]} = await import(U_${name.replace(/\W/g, '')});`;

async function plan(c, { view = 'calendar', mode = 'week' } = {}) {
  await c.ev(`localStorage.setItem('plan.view', ${JSON.stringify(view)}); localStorage.setItem('plan.calendarMode', ${JSON.stringify(mode)})`);
  await c.st(`t.navigate('home')`); await sleep(500);
  await c.nav('plan'); await sleep(700);
}
const clockOff = (c) => c.st(`t.setTunable('ui.clock12', false)`);

export const screens = [
  { id: 'history-log-past-entry', area: 'followup1', setup: async (c) => { await c.nav('history'); } },
  { id: 'log-past-sheet', area: 'followup1', setup: async (c) => { await c.nav('history'); await c.click('Log a past session'); await sleep(500); } },
  { id: 'log-past-editor', area: 'followup1', setup: async (c) => {
      await c.nav('history'); await c.click('Log a past session'); await sleep(400); await c.click('Continue'); await sleep(700);
    }, teardown: async (c) => { await c.st(`${mod('workoutModal.svelte.ts')} workoutModal.closeWorkout()`); await c.close(); } },
  // Saving the empty past session asks first (emptySessionWarning). The question is the platform's own confirm box, which
  // freezes a headless page, so the box is replaced by a stub that records the text and answers "Keep editing": the shot
  // shows the editor still open, and the recorded text is checked in setup (the screen fails when no question was asked).
  { id: 'empty-session-warning', area: 'followup1', setup: async (c) => {
      await c.nav('history'); await c.click('Log a past session'); await sleep(400); await c.click('Continue'); await sleep(700);
      await c.ev(`window.confirm = (m) => { window.__emptyConfirm = m; return false; }`);
      await c.click('Save', { exact: false }); await sleep(600);
      if (!(await c.ev(`!!window.__emptyConfirm`))) throw new Error('no empty-session question was asked');
    }, teardown: async (c) => { await c.ev(`location.reload()`); await sleep(2500); } },
  { id: 'plan-log-past-entry', area: 'followup1', setup: async (c) => { await plan(c, { view: 'blocks' }); } },
  { id: 'calendar-week-24h', area: 'followup1', setup: async (c) => { await clockOff(c); await plan(c, { mode: 'week' }); } },
  { id: 'calendar-week-12h', area: 'followup1', setup: async (c) => { await c.st(`t.setTunable('ui.clock12', true); t.setTunable('plan.weekAgenda', false); t.setTunable('plan.weekListOnPhone', false)`); await plan(c, { mode: 'week' }); }, teardown: async (c) => { await c.st(`t.setTunable('plan.weekAgenda', false); t.setTunable('plan.weekListOnPhone', true)`); await clockOff(c); await c.close(); } },
  { id: 'calendar-day-12h', area: 'followup1', setup: async (c) => { await c.st(`t.setTunable('ui.clock12', true)`); await plan(c, { mode: 'day' }); }, teardown: async (c) => { await clockOff(c); await c.close(); } },
  { id: 'settings-reminders', area: 'followup1', setup: async (c) => { await c.settings('reminders'); } },
  { id: 'settings-plan-calendar', area: 'followup1', setup: async (c) => { await c.settings('planCalendar'); } },
  { id: 'settings-ai-sharing', area: 'followup1', setup: async (c) => { await c.settings('aiSharing'); }, pages: 2 },
  { id: 'settings-backup-restore-previous', area: 'followup1', setup: async (c) => {
      await c.st(`${mod('persistence.ts')} await persistence.writeRestoreSnapshot({ at: new Date().toISOString(), workouts: 42, data: { workouts: [] } })`);
      await c.settings('sync'); await sleep(600);
    } },
];

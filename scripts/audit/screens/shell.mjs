// Shell: navigation, onboarding, tour, update card, toasts, what's new, banners, common widgets.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WELCOME_BUTTONS = ['Get started', 'Skip', 'Continue', 'Continue', 'Continue'];

/** Fresh welcome: no sessions, not welcomed, then click `n` primary buttons forward. */
async function welcome(c, n, { returning = false } = {}) {
  // Welcome only shows on an install without sessions, and applying a plan reloads from storage: empty the stored sessions too.
  await lfWorkouts(c, 'empty');
  await c.send('Page.reload'); await sleep(4500);
  await c.st(`t.setWelcomeDone(false)`);
  await sleep(900);
  if (returning) { await c.click('I already use Boulder Tracker'); return; }
  for (let i = 0; i < n; i++) {
    const labels = ['Get started', 'Skip', 'Continue', 'Use this plan', 'Continue without a plan', 'Continue', 'Next'];
    let ok = false;
    for (const l of labels) { if (await c.click(l, { within: '[aria-label="Welcome"]' })) { ok = true; break; } }
    if (!ok) break;
    await sleep(400);
  }
}
/** Empties the stored sessions, or puts the example ones back. */
async function lfWorkouts(c, mode) {
  await c.st(`const url = performance.getEntriesByType('resource').map(r=>r.name).find(n=>/localforage/.test(n));
    const lf = (await import(url)).default; lf.config({ name: 'boulder-tracker', storeName: 'training_data_v2' });
    const { buildDemoData } = await import('/src/lib/tour/demoData.ts');
    await lf.setItem('workouts', ${mode === 'empty' ? '[]' : 'buildDemoData().workouts'})`);
}
async function welcomeDown(c) {
  await c.st(`t.setWelcomeDone(true)`);
  await lfWorkouts(c, 'full');
  await c.send('Page.reload'); await sleep(4500);
}
const reloadWith = async (c, ua) => {
  await c.send('Emulation.setUserAgentOverride', { userAgent: ua });
  await c.send('Page.reload'); await sleep(4500);
};
const resetUa = async (c) => {
  await c.send('Emulation.setUserAgentOverride', { userAgent: '' });
  await c.send('Page.reload'); await sleep(4500);
};
const manifest = (extra = {}) => `{ versionCode: 412, versionName: '1.4.12', apk: 'a.apk', sha256: 'abcdef0123456789abcdef', size: 9437184, commit: '0123456789abcdef0123456789abcdef01234567', changes: [ {versionCode: 411, subject: 'Calmer toasts on the phone'}, {versionCode: 410, subject: 'A much longer change line that has to wrap onto more than one line of the card on a narrow phone screen'}, {versionCode: 409, subject: 'Fix drawer'}, {versionCode: 408, subject: 'Fourth change'} ], ...${JSON.stringify(extra)} }`;
const setUpdate = (c, status = 'idle', progress = 0) => c.st(`const { updater } = await import('/src/lib/update/updater.svelte.ts?shell=' + Date.now()); `);

export const screens = [
  // Navigation
  { id: 'nav-bar-home', area: 'shell', setup: async (c) => { await c.st(`t.setNavMode('bar')`); await c.nav('home'); } },
  { id: 'nav-bar-settings-nested', area: 'shell', setup: async (c) => { await c.st(`t.setNavMode('bar')`); await c.settings('general'); } },
  { id: 'nav-drawer-home', area: 'shell', setup: async (c) => { await c.st(`t.setNavMode('drawer')`); await c.nav('home'); } },
  { id: 'nav-drawer-open', area: 'shell', setup: async (c) => { await c.st(`t.setNavMode('drawer')`); await c.nav('home'); await c.click('Open the menu', { exact: false }); await sleep(400); } },
  { id: 'nav-drawer-plan-scrolled', area: 'shell', pages: 2, setup: async (c) => { await c.st(`t.setNavMode('drawer')`); await c.nav('plan'); } },
  { id: 'nav-auto-history', area: 'shell', setup: async (c) => { await c.st(`t.setNavMode('auto')`); await c.nav('history'); } },
  { id: 'nav-accent-orange', area: 'shell', setup: async (c) => { await c.st(`t.setNavMode('drawer'); t.setNavAccent('orange')`); await c.nav('home'); }, teardown: async (c) => { await c.st(`t.setNavAccent('blue')`); await c.close(); } },
  { id: 'nav-session-running', area: 'shell', setup: async (c) => {
      await c.st(`t.setNavMode('drawer')`); await c.nav('add');
      await c.st(`const w = t.getPlannedWorkoutsForWeek(t.currentWeekId)[0]; if (w) await t.startSession(w)`); await sleep(900);
      await c.click('Minimise session'); await sleep(600);
    }, teardown: async (c) => { await c.st(`try { t.discardSession() } catch {}; try { t.sessionStore.closeModal?.() } catch {}`); } },
  // Toasts
  { id: 'toast-plain', area: 'shell', setup: async (c) => { await c.nav('home'); await c.st(`const { toast } = await import('/src/lib/toast.svelte.ts'); toast.show('Saved', { durationMs: 600000 })`); await sleep(300); } },
  { id: 'toast-long', area: 'shell', setup: async (c) => { await c.nav('home'); await c.st(`const { toast } = await import('/src/lib/toast.svelte.ts'); toast.show('Could not reach Google Drive just now, so your last two changes are only saved on this phone for the moment and will be tried again later', { durationMs: 600000 })`); await sleep(300); } },
  { id: 'toast-undo', area: 'shell', setup: async (c) => { await c.nav('home'); await c.st(`const { toast } = await import('/src/lib/toast.svelte.ts'); toast.show('Deleted "Hangboard max hangs, 20 mm edge"', { action: { label: 'Undo', run() {} }, durationMs: 600000 })`); await sleep(300); } },
  // Banners
  { id: 'banner-example-data', area: 'shell', setup: async (c) => { await c.nav('home'); await c.st(`const { tour } = await import('/src/lib/tour/tour.svelte.ts'); await tour.startExample()`); await sleep(1200); },
    teardown: async (c) => { await c.st(`const { tour } = await import('/src/lib/tour/tour.svelte.ts'); await tour.endExample()`); await sleep(800); } },
  { id: 'banner-in-app-browser', area: 'shell', setup: async (c) => { await reloadWith(c, 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 Instagram 300.0.0.0'); await c.nav('home'); }, teardown: resetUa },
  // Update
  { id: 'update-card-home', area: 'shell', setup: async (c) => { await c.nav('home'); await c.st(`const { updater } = await import('/src/lib/update/updater.svelte.ts'); updater.supported = true; updater.installedCode = 405; updater.available = ${manifest()}`); await sleep(700); } },
  { id: 'update-card-home-details', area: 'shell', setup: async (c) => { await c.nav('home'); await c.st(`const { updater } = await import('/src/lib/update/updater.svelte.ts'); updater.supported = true; updater.installedCode = 405; updater.available = ${manifest()}`); await sleep(500); await c.click('Details'); } },
  { id: 'update-card-downloading', area: 'shell', setup: async (c) => { await c.nav('home'); await c.st(`const { updater } = await import('/src/lib/update/updater.svelte.ts'); updater.supported = true; updater.installedCode = 405; updater.available = ${manifest()}; updater.status = 'downloading'; updater.progress = 0.42`); await sleep(500); },
    teardown: async (c) => { await c.st(`const { updater } = await import('/src/lib/update/updater.svelte.ts'); updater.status = 'idle'; updater.available = null`); } },
  { id: 'update-settings-available', area: 'shell', setup: async (c) => { await c.st(`const { updater } = await import('/src/lib/update/updater.svelte.ts'); updater.supported = true; updater.installedCode = 405; updater.available = ${manifest()}`); await c.settings('about'); }, pages: 2 },
  { id: 'update-settings-uptodate', area: 'shell', setup: async (c) => { await c.st(`const { updater } = await import('/src/lib/update/updater.svelte.ts'); updater.supported = true; updater.installedCode = 412; updater.available = null; updater.upToDate = true`); await c.settings('about'); } },
  // What's new
  { id: 'whats-new-sheet', area: 'shell', setup: async (c) => { await c.ev(`localStorage.setItem('boulder_tracker_release_notes_seen','0')`); await c.send('Page.reload'); await sleep(4500); await c.st(`t.setWelcomeDone(true)`); await sleep(500); },
    // Without this the sheet comes back after every later reload and covers the next screens.
    teardown: async (c) => { await c.st(`(await import('/src/lib/releaseNotes.ts')).markNotesSeen()`); await c.close(); await c.send('Page.reload'); await sleep(4500); await c.st(`t.setWelcomeDone(true)`); } },
  // Onboarding
  { id: 'welcome-intro', area: 'shell', setup: async (c) => welcome(c, 0), teardown: welcomeDown },
  { id: 'welcome-platforms', area: 'shell', setup: async (c) => welcome(c, 1), teardown: welcomeDown },
  { id: 'welcome-focus', area: 'shell', setup: async (c) => welcome(c, 2), teardown: welcomeDown },
  { id: 'welcome-plan', area: 'shell', setup: async (c) => welcome(c, 3), pages: 2, teardown: welcomeDown },
  { id: 'welcome-units', area: 'shell', setup: async (c) => welcome(c, 4), teardown: welcomeDown },
  { id: 'welcome-location', area: 'shell', setup: async (c) => welcome(c, 5), teardown: welcomeDown },
  { id: 'welcome-done', area: 'shell', setup: async (c) => welcome(c, 6), teardown: welcomeDown },
  { id: 'welcome-returning', area: 'shell', setup: async (c) => welcome(c, 0, { returning: true }), teardown: welcomeDown },
  { id: 'welcome-ios-safari', area: 'shell', pages: 2, setup: async (c) => {
      await c.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
      await c.send('Page.reload'); await sleep(4500); await welcome(c, 1);
    }, teardown: async (c) => { await c.st(`t.setWelcomeDone(true)`); await resetUa(c); } },
  { id: 'welcome-ios-chrome', area: 'shell', pages: 2, setup: async (c) => {
      await c.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1' });
      await c.send('Page.reload'); await sleep(4500); await welcome(c, 1);
    }, teardown: async (c) => { await c.st(`t.setWelcomeDone(true)`); await resetUa(c); } },
  { id: 'welcome-in-app-browser', area: 'shell', setup: async (c) => {
      await c.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Instagram 300.0.0.0' });
      await c.send('Page.reload'); await sleep(4500); await welcome(c, 1);
    }, teardown: async (c) => { await c.st(`t.setWelcomeDone(true)`); await resetUa(c); } },
  // Tour
  ...[0, 2, 4, 6, 8].map((i) => ({ id: `tour-step-${i}`, area: 'shell', setup: async (c) => {
      await c.nav('home');
      await c.st(`const { tour } = await import('/src/lib/tour/tour.svelte.ts'); if (!tour.active) await tour.start(); tour.go(${i})`); await sleep(1200);
    }, teardown: async (c) => { await c.st(`const { tour } = await import('/src/lib/tour/tour.svelte.ts'); await tour.end(); `); await sleep(800); } })),
  // Common widgets
  { id: 'info-sheet', area: 'shell', setup: async (c) => { await c.nav('home'); const ok = await c.click('What is', { exact: false }); if (!ok) throw new Error('no info button'); await sleep(500); } },
  { id: 'fatigue-modal', area: 'shell', setup: async (c) => { await c.nav('add');
      await c.st(`const w = t.getPlannedWorkoutsForWeek(t.currentWeekId)[0]; if (w) { await t.startSession(w); } t.finishSession()`); await sleep(1000); },
    teardown: async (c) => { await c.st(`try { t.uiStore.closeFatigueModal?.() } catch {}; t.uiStore.showFatigue = false; try { t.discardSession() } catch {}`); } },
];

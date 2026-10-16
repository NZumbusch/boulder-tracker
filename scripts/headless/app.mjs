// A higher-level helper over lib.mjs for agents who need to *see* the app: it handles the traps that cost whole sessions.
//
//   npx vite --port 5199 &                       # the dev server first
//   import { openApp } from './app.mjs';
//   const app = await openApp({ example: true, theme: 'light' });   // fresh Chrome, example data, welcome skipped
//   await app.go('plan');                          // navigate through the app's own state
//   await app.click('Show the calendar');          // a button by aria-label or its text
//   console.log(await app.shot('plan'));           // a PNG path - every call gets a NEW file name (see below)
//   await app.startLiveSession();                  // a running session on example data (what `startSession` refuses)
//   await app.close();
//
// What it does for you (each of these has cost an hour):
//  - kills leftover `chrome` processes first: a stale one still holding the debug port answers instead of the new one, and
//    every screenshot is then the same old page;
//  - a fresh profile directory per run (Chrome restores old tabs and storage otherwise);
//  - imports the app's modules (`state.svelte.ts`, `tour.svelte.ts`) by the URL the page itself loaded - after hot reload a
//    plain-path import is a *second copy* and nothing you change on it shows;
//  - screenshots get a counter in the file name: an image viewer that caches by path shows the first picture again for a
//    re-used name, which looks exactly like "my change did nothing";
//  - `press`/`release` for hold gestures: the headless compositor may not repaint until the mouse moves, so a held-state
//    screenshot needs a one-pixel `nudge` first.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { launch, OUT } from './lib.mjs';

const STATE_URL = String.raw`/\/src\/lib\/state\.svelte\.ts/`;
const TOUR_URL = String.raw`/\/lib\/tour\/tour\.svelte\.ts/`;
/** Evaluates an app module's export by the URL the page loaded it from (the last match, i.e. the newest copy). */
const moduleExpr = (pattern, fallback, exportName, body) =>
  `(async()=>{const us=performance.getEntriesByType('resource').map(r=>r.name).filter(n=>${pattern}.test(n));` +
  `const m=await import(us.length?us[us.length-1]:'${fallback}'); const X=m.${exportName}; ${body}})()`;

export async function openApp({ url = 'http://localhost:5199/#/home', width = 400, height = 860, scale = 2, theme, example = false, port = 9333, settleMs = 7000 } = {}) {
  spawnSync('pkill', ['-x', 'chrome']); // exact process name, so it cannot match this shell
  await new Promise((r) => setTimeout(r, 1200));
  const page = await launch(`bt-app-${Date.now()}`, { port, width, height, scale });
  const { send, ev, wait, logs, chrome } = page;
  await send('Page.navigate', { url });
  await wait(settleMs);

  let n = 0;
  /** Runs `body` in the page with the app's state as `s` (use `return` for a value). */
  const withState = (body) => ev(moduleExpr(STATE_URL, '/src/lib/state.svelte.ts', 'trainingState', `const s=X; ${body}`));
  const withTour = (body) => ev(moduleExpr(TOUR_URL, '/src/lib/tour/tour.svelte.ts', 'tour', `const t=X; ${body}`));
  const setTheme = (t) => ev(`document.documentElement.dataset.theme=${JSON.stringify(t)}`);

  const app = {
    ...page,
    withState,
    withTour,
    setTheme,
    /** Looks around with the example data (no banner trouble: it is cropped by `crop` if you ask), and skips the welcome. */
    async startExample() { await withTour('await t.startExample()'); await wait(4000); await withState('s.welcomeDone=true'); },
    /** Skips the first-run welcome on an empty install. */
    skipWelcome: () => withState('s.welcomeDone=true'),
    /** Navigates through the app's own state ('home' | 'plan' | 'add' | 'history' | 'analytics' | 'settings'). */
    async go(view, ms = 1200) { await withState(`s.navigate(${JSON.stringify(view)})`); await wait(ms); },
    setTunable: (id, value) => withState(`s.setTunable(${JSON.stringify(id)}, ${JSON.stringify(value)})`),
    /** Clicks the first button/link/tab whose aria-label equals `label` or whose text contains it. Resolves to whether one was found. */
    async click(label, ms = 800) {
      const found = await ev(`(()=>{const L=${JSON.stringify(label)}; const els=[...document.querySelectorAll('button,a,[role=tab],[role=radio],[role=switch]')];
        const el=els.find(e=>e.getAttribute('aria-label')===L)||els.find(e=>(e.textContent||'').trim().includes(L)); if(el) el.click(); return !!el})()`);
      await wait(ms);
      return found;
    },
    /** Screenshot to a NEW file name each call; returns the path. `crop` = px (at device scale) cut off the top, e.g. the example banner. */
    async shot(name, { crop = 0 } = {}) {
      const r = await send('Page.captureScreenshot', { format: 'png', ...(crop ? { clip: { x: 0, y: crop / scale, width, height: height - crop / scale, scale } } : {}) });
      fs.mkdirSync(OUT, { recursive: true });
      const file = path.join(OUT, `${name}-${++n}.png`);
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      return file;
    },
    /** A running live session on the first planned workout that has exercises. Example data refuses sessions, so this lifts that flag. */
    async startLiveSession() {
      const name = await withState(`s.demoActive=false; const w=s.workouts.find(x=>x.status==='planned'&&x.exercises.length>1)||s.workouts.find(x=>x.exercises.length>0); if(!w) return 'no workout with exercises'; s.startSession(JSON.parse(JSON.stringify(w))); return w.notes`);
      await wait(2000);
      return name;
    },
    /** A mouse press (hold) at a point; `nudge` repaints headless Chrome without leaving the element. */
    press: (x, y) => send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }),
    nudge: (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 1, y, button: 'left' }),
    release: (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }),
    /** The rectangle of the first element matching a CSS selector, in CSS pixels. */
    rect: async (selector) => JSON.parse(await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return 'null'; const r=e.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height})})()`)),
    close() { chrome.kill(); spawnSync('pkill', ['-x', 'chrome']); },
  };
  if (theme) await setTheme(theme);
  if (example) await app.startExample();
  return { ...app, errors: logs, OUT };
}

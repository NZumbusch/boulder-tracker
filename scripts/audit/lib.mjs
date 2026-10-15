// The screen audit: every screen, sheet and modal of the app, at every device size, in both themes, with automatic
// checks for what is easy to get wrong (overflow, clipped text, tiny text, small tap targets, console errors).
//
//   npx vite --port 5199 &
//   node scripts/audit/run.mjs --area=home --out=/some/dir            # one area's screens (scripts/audit/screens/<area>.mjs)
//
// See docs/ui-audit/PLAN.md. A screen is `{ id, area, setup(c), pages?, notes? }`; `c` is the context below.
import fs from 'node:fs';
import path from 'node:path';
import { launch, STATE_EXPR } from '../headless/lib.mjs';

/** Device classes. `mobile` turns on touch emulation and the phone viewport meta behaviour. */
export const VIEWPORTS = [
  { id: 'phone-p', label: 'Phone portrait', w: 390, h: 844, mobile: true },
  { id: 'phone-l', label: 'Phone landscape', w: 844, h: 390, mobile: true },
  { id: 'tablet-p', label: 'Tablet portrait', w: 820, h: 1180, mobile: true },
  { id: 'tablet-l', label: 'Tablet landscape', w: 1180, h: 820, mobile: true },
  { id: 'laptop', label: 'Laptop', w: 1366, h: 768, mobile: false },
];
export const THEMES = ['light', 'dark'];

/** Runs inside the page: what is wrong with what is on screen right now. Pure DOM reads. */
const CHECKS = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const out = { pageOverflowX: false, offscreen: [], smallTargets: [], tinyText: [], clipped: [], emptyButtons: [] };
  const describe = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
    const cls = (el.className && el.className.baseVal === undefined ? String(el.className) : '').split(' ').filter(Boolean).slice(0, 3).join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (t ? ' "' + t + '"' : '');
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    for (let p = el; p; p = p.parentElement) { if (p.hasAttribute('inert') || p.getAttribute('aria-hidden') === 'true') return null; }
    return { r, cs };
  };
  const inSideScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  const root = document.documentElement;
  out.pageOverflowX = root.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1;
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    const v = visible(el); if (!v) continue;
    const { r, cs } = v;
    if ((r.right > vw + 1 || r.left < -1) && !inSideScroller(el) && cs.position !== 'fixed' && out.offscreen.length < 8) out.offscreen.push(describe(el) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + vw + ']');
    const tag = el.tagName;
    const interactive = tag === 'BUTTON' || tag === 'A' || tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && el.type !== 'hidden') || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'switch' || el.getAttribute('role') === 'tab';
    if (interactive) {
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim();
      if (!label && !el.querySelector('img,svg[aria-label],[aria-label]') && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && out.emptyButtons.length < 6) out.emptyButtons.push(describe(el));
      const tapGrown = /(^| )(tap|btn|btn-icon|btn-quiet|chip|seg-item)( |$)/.test(String(el.className)) || el.closest('.tap,.btn,.btn-icon,.btn-quiet,.seg,label');
      const inline = tag === 'A' && cs.display === 'inline';
      if ((r.width < 40 || r.height < 40) && !tapGrown && !inline && out.smallTargets.length < 12) out.smallTargets.push(describe(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    // text
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
    if (own.trim().length > 1) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 11 && out.tinyText.length < 8) out.tinyText.push(describe(el) + ' ' + fs + 'px');
      const hidden = cs.overflow === 'hidden' || cs.overflowX === 'hidden';
      if (hidden && !el.closest(".sr-only") && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && !cs.webkitLineClamp && out.clipped.length < 8) out.clipped.push(describe(el) + ' text cut at the side (' + el.scrollWidth + ' > ' + el.clientWidth + ')');
      if (hidden && !el.closest(".sr-only") && el.scrollHeight > el.clientHeight + 2 && cs.overflowY === 'hidden' && cs.webkitLineClamp === 'none' && el.clientHeight > 0 && out.clipped.length < 8 && !/truncate|line-clamp/.test(String(el.className))) out.clipped.push(describe(el) + ' text cut at the bottom (' + el.scrollHeight + ' > ' + el.clientHeight + ')');
    }
  }
  return out;
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Starts Chrome on the app, with the example data (plus a few places) loaded and the welcome screen out of the way. */
export async function startAudit({ port = 9440, profile = 'audit', appUrl = 'http://localhost:5199/', out }) {
  fs.mkdirSync(out, { recursive: true });
  const page = await launch(profile, { port, width: 390, height: 844, scale: 1 });
  const { send, ev, wait } = page;
  await send('Page.navigate', { url: appUrl + '#/home' });
  await wait(4500);
  await ev(`(async()=>{
    const url = performance.getEntriesByType('resource').map(r=>r.name).find(n=>/localforage/.test(n));
    const lf = (await import(url)).default;
    lf.config({ name: 'boulder-tracker', storeName: 'training_data_v2' });
    await lf.clear();
    const { buildDemoData } = await import('/src/lib/tour/demoData.ts');
    const d = buildDemoData();
    d.places = [{ name: 'Steinbock Konstanz', kind: 'gym', price: 'CHF 22', hours: 'Mon-Fri 9-22', notes: 'Board on the left wall' }, { name: 'Brione', kind: 'crag', latitude: 46.3, longitude: 8.8 }, { name: 'Home wall', kind: 'home', latitude: 47.66, longitude: 9.17 }];
    for (const k of Object.keys(d)) if (k !== 'exportVersion') await lf.setItem(k, d[k]);
    await lf.setItem('database_version', d.exportVersion);
  })()`);
  await send('Page.reload');
  await wait(4500);
  const st = (js) => ev(`(async()=>{const t=await ${STATE_EXPR}; ${js}})()`);
  await st(`t.preferencesStore.setWelcomeDone(true)`);
  const c = {
    ...page,
    out,
    st,
    /** Go to a main view and let it settle. */
    nav: async (view) => { await st(`t.navigate('${view}')`); await wait(900); },
    /** Open a Settings page by id (see lib/settings/tree.ts). */
    settings: async (pageId) => { await st(`t.navigate('settings'); t.uiStore.settingsPageRequest='${pageId}'`); await wait(1100); },
    /** Click the first visible button/link/tab whose text (or aria-label) equals or contains `text`. */
    click: async (text, { exact = true, within = 'body' } = {}) => ev(`(()=>{const q=${JSON.stringify(text)};const root=document.querySelector(${JSON.stringify(within)})||document.body;const els=[...root.querySelectorAll('button,a,[role=button],[role=tab],[role=switch],[role=radio],summary,label')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});const t=e=>((e.getAttribute('aria-label')||'')+' '+(e.textContent||'')).trim().replace(/\\s+/g,' ');const hit=els.find(e=>${exact ? 't(e)===q||(e.getAttribute("aria-label")||"")===q||(e.textContent||"").trim()===q' : 't(e).includes(q)'});if(!hit)return false;hit.click();return true})()`).then(async (ok) => { await wait(700); return ok; }),
    /** Press Escape / the Back key: closes the top sheet. */
    close: async () => { await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await wait(500); },
    /** Scroll the main scroll container (or a given selector) to a fraction of its height. */
    scrollTo: async (frac, sel) => ev(`(()=>{const els=${sel ? `[document.querySelector(${JSON.stringify(sel)})]` : '[...document.querySelectorAll("*")].filter(e=>{const o=getComputedStyle(e).overflowY;return (o==="auto"||o==="scroll")&&e.scrollHeight>e.clientHeight+40})'};const e=els.filter(Boolean).sort((a,b)=>b.clientHeight-a.clientHeight)[0];if(e)e.scrollTop=(e.scrollHeight-e.clientHeight)*${frac};return !!e})()`),
    setTheme: (theme) => ev(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`),
  };
  return c;
}

/**
 * Captures one screen at every viewport and theme. Returns the report rows:
 * `{ id, vp, theme, file, issues: { pageOverflowX, offscreen, smallTargets, tinyText, clipped, emptyButtons }, console }`.
 */
export async function auditScreen(c, screen, { viewports = VIEWPORTS, themes = THEMES } = {}) {
  const rows = [];
  const before = c.logs.length;
  await c.resize(390, 844, true, 1);
  await c.setTheme('light');
  try {
    await screen.setup(c);
  } catch (err) {
    return [{ id: screen.id, error: 'setup failed: ' + String(err).slice(0, 200) }];
  }
  await sleep(500);
  for (const theme of themes) {
    await c.setTheme(theme);
    for (const vp of viewports) {
      await c.resize(vp.w, vp.h, vp.mobile, 1);
      await sleep(350);
      const issues = JSON.parse((await c.ev(`JSON.stringify(${CHECKS})`)) || '{}');
      const pages = screen.pages ?? 1;
      const files = [];
      for (let p = 0; p < pages; p++) {
        if (pages > 1) await c.scrollTo(pages === 1 ? 0 : p / (pages - 1));
        await sleep(200);
        const name = `${screen.id}__${theme}__${vp.id}${pages > 1 ? '__p' + (p + 1) : ''}.png`;
        const file = await c.shot(name);
        files.push(file);
      }
      if (pages > 1) await c.scrollTo(0);
      rows.push({ id: screen.id, vp: vp.id, theme, files, issues });
    }
  }
  const consoleNew = c.logs.slice(before).filter((l) => !/HomeWidget|favicon|Download the React/.test(l));
  if (rows.length) rows[0].console = consoleNew;
  try { if (screen.teardown) await screen.teardown(c); else await c.close(); } catch { /* the next setup starts from a main view anyway */ }
  return rows;
}

/** Whether a row has anything an agent must look at. */
export function flagged(row) {
  const i = row.issues ?? {};
  return !!(row.error || i.pageOverflowX || i.offscreen?.length || i.clipped?.length || i.emptyButtons?.length);
}

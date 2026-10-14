// A small helper for looking at the running app in headless Chrome over the DevTools protocol - no extra dependencies
// (Node 22 has fetch and WebSocket). See docs/HANDOVER.md, "Checking a change in a browser".
//
//   npx vite --port 5199 &                      # the dev server
//   node scripts/headless/example.mjs           # an example run; copy it as a starting point
//
// `launch()` starts Chrome (google-chrome must be installed), returns send/ev/shot/wait and the errors the page logged.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const OUT = process.env.HEADLESS_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'bt-shots-'));

export async function launch(profile = 'bt-headless', { port = 9333, width = 400, height = 860, mobile = true, scale = 2 } = {}) {
  const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, `--user-data-dir=${path.join(os.tmpdir(), profile)}`, 'about:blank'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const targets = await (await fetch(`http://localhost:${port}/json`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(m.params.type.toUpperCase() + ' ' + m.params.args.map((a) => String(a.value ?? a.description)).join(' ').slice(0, 300));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  /** Runs an expression in the page and returns its value (promises are awaited). */
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, name);
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await send('Runtime.enable');
  const resize = (w, h, m = mobile, s = scale) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: s, mobile: m });
  await resize(width, height);
  return { chrome, send, ev, shot, wait, logs, resize };
}

/**
 * Puts a backup file into the app's storage as an install of that data version would have it, then reloads - so the
 * real startup migration runs. Navigate to the app first. Uses the app's own localforage.
 */
export async function seedBackup({ send, ev, wait }, backupPath) {
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  await ev(`(async()=>{
    const url = performance.getEntriesByType('resource').map(r=>r.name).find(n=>/localforage/.test(n));
    const lf = (await import(url)).default;
    lf.config({ name: 'boulder-tracker', storeName: 'training_data_v2' });
    await lf.clear();
    const d = ${JSON.stringify(data)};
    for (const k of Object.keys(d)) if (k !== 'exportVersion') await lf.setItem(k, d[k]);
    await lf.setItem('database_version', d.exportVersion);
  })()`);
  await send('Page.reload');
  await wait(4500);
}

/** The app's own TrainingState, from inside the page. Importing it by plain path can give a second copy after a hot reload - take the URL the app loaded. */
export const STATE_EXPR = `(async()=>{const u=performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\\/src\\/lib\\/state\\.svelte\\.ts/.test(n)); return (await import(u)).trainingState})()`;

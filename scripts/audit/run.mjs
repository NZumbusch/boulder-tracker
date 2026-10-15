// node scripts/audit/run.mjs --area=<name> --out=<dir> [--only=id1,id2] [--vp=phone-p,laptop] [--themes=light] [--port=9440] [--app=http://localhost:5199/]
// Writes <out>/<area>/*.png, <out>/<area>/report.json and one contact sheet per screen (<id>__light.png, <id>__dark.png).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startAudit, auditScreen, flagged, VIEWPORTS, THEMES } from './lib.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').slice(k.length + 3) || d;
const area = arg('area');
if (!area) { console.error('--area=<name> is required (see scripts/audit/screens/)'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(arg('out', path.join('/tmp', 'audit')), area);
const only = arg('only', '').split(',').filter(Boolean);
const vpIds = arg('vp', '').split(',').filter(Boolean);
const themes = arg('themes', '').split(',').filter(Boolean);
const { screens } = await import(pathToFileURL(path.join(here, 'screens', `${area}.mjs`)).href);
const list = screens.filter((s) => !only.length || only.includes(s.id));
fs.mkdirSync(out, { recursive: true });
const c = await startAudit({ port: Number(arg('port', 9440)), profile: `audit-${area}`, appUrl: arg('app', 'http://localhost:5199/'), out });
const report = [];
for (const s of list) {
  const rows = await auditScreen(c, s, { viewports: vpIds.length ? VIEWPORTS.filter((v) => vpIds.includes(v.id)) : VIEWPORTS, themes: themes.length ? themes : THEMES });
  report.push(...rows);
  const bad = rows.filter(flagged);
  console.log(`${s.id}: ${rows.length} shots, ${bad.length} flagged${rows[0]?.error ? ' - ' + rows[0].error : ''}`);
  // A contact sheet per theme: all viewports in one image, so one look covers the whole screen.
  for (const theme of themes.length ? themes : THEMES) {
    const files = rows.filter((r) => r.theme === theme).flatMap((r) => r.files.slice(0, 1).map((f) => `${r.vp}=${f}`));
    if (files.length) spawnSync('python3', ['-I', path.join(here, 'montage.py'), path.join(out, `${s.id}__${theme}.png`), ...files], { stdio: 'inherit' });
  }
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
const flaggedRows = report.filter(flagged);
fs.writeFileSync(path.join(out, 'flagged.txt'), flaggedRows.map((r) => `${r.id} ${r.theme} ${r.vp}: ${r.error ?? JSON.stringify({ ...r.issues, tinyText: undefined, smallTargets: r.issues?.smallTargets?.length })}`).join('\n'));
console.log(`done: ${list.length} screens, ${report.length} captures, ${flaggedRows.length} flagged -> ${out}`);
c.chrome.kill();
process.exit(0);

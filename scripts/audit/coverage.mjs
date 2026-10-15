// Which component files does no area status file mention?
//   node scripts/audit/coverage.mjs
// Lists every src/components/**/*.svelte file; one is "covered" when its basename (without .svelte) appears as a word in
// some docs/ui-audit/<area>.md status file. Exits 1 when any file is uncovered.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : e.name.endsWith('.svelte') ? [p] : [];
});
const files = walk(path.join(root, 'src/components')).sort();
const docDir = path.join(root, 'docs/ui-audit');
const skip = new Set(['PLAN.md', 'questions.md']);
const docs = fs.readdirSync(docDir).filter((f) => f.endsWith('.md') && !skip.has(f)).map((f) => ({ f, text: fs.readFileSync(path.join(docDir, f), 'utf8') }));
const missing = [];
let covered = 0;
for (const file of files) {
  const name = path.basename(file, '.svelte');
  const re = new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`);
  if (docs.some((d) => re.test(d.text))) covered++;
  else missing.push(path.relative(root, file));
}
console.log(`${files.length} components, ${covered} mentioned in a status file (${docs.map((d) => d.f).join(', ') || 'no status files'}), ${missing.length} not.`);
for (const m of missing) console.log('  missing: ' + m);
process.exit(missing.length ? 1 : 0);

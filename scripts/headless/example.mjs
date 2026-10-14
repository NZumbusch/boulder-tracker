// Example: open the app on example data, go through the main screens through the drawer, screenshot each.
//   node scripts/headless/example.mjs [path/to/backup.json]
import { launch, seedBackup, OUT } from './lib.mjs';

const page = await launch('bt-example');
const { send, ev, shot, wait, logs, chrome } = page;
await send('Page.navigate', { url: 'http://localhost:5199/#/home' });
await wait(3500);
if (process.argv[2]) await seedBackup(page, process.argv[2]);
else {
  await ev(`(async()=>{const m=await import('/src/lib/tour/tour.svelte.ts'); await m.tour.startExample();})()`);
  await wait(1500);
}
for (const label of ['Home', 'Plan', 'History', 'Analytics', 'Settings']) {
  await ev(`document.querySelector('[aria-label="Open the menu"]')?.click()`);
  await wait(400);
  await ev(`[...document.querySelectorAll('nav[aria-label="Main menu"] button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)}))?.click()`);
  await wait(900);
  console.log(await shot(`${label.toLowerCase()}.png`));
}
console.log('page errors:', logs.length ? logs : 'none', '\nscreenshots in', OUT);
chrome.kill();
process.exit(0);

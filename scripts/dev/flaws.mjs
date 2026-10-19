// Renders the letter in page view at several master settings: node scripts/dev/flaws.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1000, height: 1300 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:4173/');
await p.waitForTimeout(1200);
await p.click('text=Letter');
await p.click('text=See the page');
await p.waitForTimeout(800);
for (const v of process.argv.slice(2).length ? process.argv.slice(2) : ['0', '0.35', '0.7', '1']) {
  await p.$eval('.master input', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await p.waitForTimeout(700);
  const box = await (await p.$('.sheet')).boundingBox();
  await p.screenshot({ path: `/tmp/claude-0/shots/flaw-${v}.png`, clip: { x: box.x + box.width * 0.1, y: box.y + box.height * 0.08, width: box.width * 0.8, height: box.height * 0.32 } });
}
await b.close();

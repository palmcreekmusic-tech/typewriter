// Realistic vs artistic at the far end, plus papers: node scripts/dev/realism.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
const out = '/tmp/claude-0/shots/real/';
execFileSync('mkdir', ['-p', out]);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1100, height: 1300 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:4173/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(1200);
await p.click('text=Letter');
await p.click('text=See the page');
const master = (v) => p.$eval('.master input', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
const slide = async (label, v) => {
  const loc = p.locator('.drawer label.field', { hasText: label }).first().locator('input[type=range]');
  await loc.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
};
const shot = async (name) => {
  await p.waitForTimeout(700);
  const box = await (await p.$('.sheet')).boundingBox();
  await p.screenshot({ path: out + name + '.png', clip: { x: box.x + box.width * 0.08, y: box.y + box.height * 0.08, width: box.width * 0.84, height: box.height * 0.3 } });
};
const close = async () => { await p.click('.drawer .close'); await p.waitForTimeout(400); };
for (const v of [0.35, 0.7, 1]) { await master(v); await shot(`real-${v}`); }
await p.click('text=Adjust');
await p.click('.mode >> text=Artistic');
await close();
await shot('artistic-1');
await p.click('text=Adjust');
await p.click('.mode >> text=Realistic');
await slide('Ghost after words', 0.8);
await slide('Ribbon riding high', 0.8);
await p.click('.seg button:has-text("Sticky note")');
await close();
await master(0.35);
await shot('sticky-ghost');
await p.click('text=Adjust');
await p.click('.seg button:has-text("Newsprint")');
await slide('Ghost after words', 0);
await slide('Ribbon riding high', 0);
await p.locator('#adj-mistakes select').selectOption('strikeover');
await slide('Random typos', 1);
await close();
await shot('newsprint-strikeover');
await b.close();

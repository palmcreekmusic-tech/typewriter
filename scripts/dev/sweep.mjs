// For every slider in Adjust, renders the letter at 0, 0.5 and 1 (master at 0)
// and stacks the crops: node scripts/dev/sweep.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
const out = '/tmp/claude-0/shots/sweep/';
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
const setMaster = (v) => p.$eval('.master input', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
await setMaster(String(process.env.MASTER ?? 0));
await p.click('text=Adjust');
const labels = await p.$$eval('.drawer label.field', (els) => els.filter((e) => e.querySelector('input[type=range]')).map((e) => e.querySelector('span').childNodes[0].textContent.trim()));
console.log(labels.join(' | '));
const only = process.argv.slice(2);
for (const label of labels) {
  if (only.length && !only.some((o) => label.toLowerCase().includes(o.toLowerCase()))) continue;
  if (/margin|line length|warmth/i.test(label)) continue;
  const loc = p.locator('.drawer label.field', { hasText: label }).first().locator('input[type=range]');
  const orig = await loc.inputValue();
  for (const v of ['0', '0.5', '1']) {
    await loc.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await p.waitForTimeout(500);
    const box = await (await p.$('.sheet')).boundingBox();
    await p.screenshot({ path: `${out}${label.replace(/\W+/g, '_')}-${v}.png`, clip: { x: box.x + box.width * 0.08, y: box.y + box.height * 0.13, width: box.width * 0.62, height: box.height * 0.13 } });
  }
  await loc.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, orig);
}
await b.close();

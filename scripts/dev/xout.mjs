// X-out and strikethrough looks: node scripts/dev/xout.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
const out = '/tmp/claude-0/shots/xout/';
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
const slide = async (label, v) => {
  const loc = p.locator('.drawer label.field', { hasText: label }).first().locator('input[type=range]');
  await loc.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
};
for (const style of ['xout', 'strikethrough']) {
  await p.click('text=Adjust');
  await p.locator('#adj-mistakes select').selectOption(style);
  await slide('Random typos', 0.8);
  await p.click('.drawer .close');
  await p.waitForTimeout(800);
  const box = await (await p.$('.sheet')).boundingBox();
  await p.screenshot({ path: out + style + '.png', clip: { x: box.x + box.width * 0.08, y: box.y + box.height * 0.08, width: box.width * 0.84, height: box.height * 0.28 } });
}
// typing into it live still works and lands at the caret
await p.click('text=Back to typing');
await p.keyboard.type(' Tpyed live.');
await p.waitForTimeout(500);
await p.screenshot({ path: out + 'typing.png' });
await b.close();

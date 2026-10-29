// Types a caption with real backspace corrections and screenshots it close up:
// node scripts/dev/fixes.mjs [style] [mess] [age]
import { chromium } from 'playwright';
const [style = 'whiteout', mess, age] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:4173/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(1200);
// clear the sample caption
await p.keyboard.press('Control+A');
await p.keyboard.press('Backspace');
for (const part of ['Somewhere wesy', 'Backspace', 't of here, 196', 'Backspace', 'Backspace', '62. Golden hoor', 'Backspace', 'Backspace', 'ur.']) {
  if (part === 'Backspace') await p.keyboard.press('Backspace');
  else await p.keyboard.type(part, { delay: 15 });
}
await p.click('text=Adjust');
await p.locator('.drawer label.field', { hasText: 'Fixed with' }).locator('select').selectOption(style);
const setRange = async (label, v) => {
  await p.locator('.drawer label.field', { hasText: label }).locator('input[type=range]').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
};
if (mess) await setRange('Mess', mess);
if (age) await setRange('Age', age);
await p.click('.drawer .close');
await p.waitForTimeout(800);
const box = await (await p.$('.sheet')).boundingBox();
await p.screenshot({ path: `/tmp/claude-0/shots/fix-${style}${mess ? '-' + mess : ''}${age ? '-' + age : ''}.png`, clip: { x: Math.max(0, box.x), y: box.y, width: Math.min(1200 - Math.max(0, box.x), box.width), height: box.height } });
await b.close();

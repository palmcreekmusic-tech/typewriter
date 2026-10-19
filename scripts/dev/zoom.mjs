// Close-up crop of the letter in page view: node scripts/dev/zoom.mjs <master> [ink]
import { chromium } from 'playwright';
const [master = '1', ink] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1000, height: 1300 }, deviceScaleFactor: 3 });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:4173/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(1200);
await p.click('text=Letter');
await p.click('text=See the page');
await p.waitForTimeout(800);
await p.$eval('.master input', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, master);
if (ink) {
  await p.click('text=Adjust');
  await p.$eval('.drawer input[type=range]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, ink);
  await p.click('.drawer .close');
}
await p.waitForTimeout(900);
const box = await (await p.$('.sheet')).boundingBox();
await p.screenshot({ path: `/tmp/claude-0/shots/zoom-${master}${ink ? '-' + ink : ''}.png`, clip: { x: box.x + box.width * 0.12, y: box.y + box.height * 0.2, width: box.width * 0.45, height: box.height * 0.1 } });
await b.close();

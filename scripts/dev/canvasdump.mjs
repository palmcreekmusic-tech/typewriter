// Saves the page canvas bitmap itself: node scripts/dev/canvasdump.mjs [master] [page]
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const [master, pageView] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const m = await b.newPage({ viewport: { width: 1000, height: 1300 }, deviceScaleFactor: 2 });
m.on('pageerror', (e) => console.log('ERR', e.message));
await m.goto('http://localhost:4173/');
await m.evaluate(() => localStorage.clear());
await m.reload();
await m.waitForTimeout(1200);
await m.click('text=Letter');
if (pageView) await m.click('text=See the page');
if (master) await m.$eval('.master input', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, master);
await m.waitForTimeout(1500);
const url = await m.$eval('.sheet canvas', (c) => c.toDataURL());
writeFileSync('/tmp/claude-0/shots/canvas.png', Buffer.from(url.split(',')[1], 'base64'));
await b.close();

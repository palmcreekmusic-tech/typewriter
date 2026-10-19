// Close-up of letter mode on a phone-sized screen: node scripts/dev/phonezoom.mjs [master] [noquirks]
import { chromium } from 'playwright';
const [master, noq] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await m.addInitScript((d) => (globalThis.__dbg = d), process.env.DBG ?? '');
await m.goto('http://localhost:4173/');
await m.waitForTimeout(1200);
await m.click('text=Letter');
if (process.env.PAGE) { await m.click('.short:text("Page")'); await m.waitForTimeout(900); }
if (master) await m.$eval('.master input', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, master);
if (noq) {
  await m.click('text=Adjust');
  for (let i = 0; i < 10; i++) { const x = await m.$('.quirk .x'); if (!x) break; await x.click(); }
  await m.click('.drawer .close');
}
await m.waitForTimeout(1200);
await m.screenshot({ path: `/tmp/claude-0/shots/phonezoom-${master ?? 'd'}${noq ? '-nq' : ''}.png`, clip: process.env.CLIP ? JSON.parse(process.env.CLIP) : { x: 200, y: 200, width: 190, height: 140 } });
await b.close();

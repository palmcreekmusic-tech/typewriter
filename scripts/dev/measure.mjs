// Prints the header's widths on a phone, to check it fits.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(500);
for (const mode of ['Caption', 'Photo']) {
  await p.click(`.seg button:has-text("${mode}")`);
  await p.waitForTimeout(200);
  console.log(mode, await p.$$eval('.top > *', (els) => els.map((e) => `${e.className.split(' ')[0]}:${Math.round(e.getBoundingClientRect().width)}`).join(' ')), await p.evaluate(() => document.documentElement.scrollWidth));
}
await b.close();

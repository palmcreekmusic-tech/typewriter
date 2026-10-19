// Screenshots each preset in caption mode: node scripts/dev/presets.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
await p.goto('http://localhost:4173/');
await p.waitForTimeout(1200);
const names = await p.$$eval('.preset-list button', (els) => els.map((e) => e.textContent));
for (let i = 0; i < 8; i++) {
  await p.click('.preset-btn');
  await p.locator('.preset-list button').nth(i).click();
  await p.waitForTimeout(900);
  await p.screenshot({ path: `/tmp/claude-0/shots/preset-${i}.png`, clip: { x: 0, y: 150, width: 1100, height: 420 } });
}
await b.close();

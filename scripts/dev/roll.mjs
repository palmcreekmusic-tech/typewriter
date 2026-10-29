// Screenshots of a roll: three photos picked at once, each with its own
// print and caption from the same machine. Needs `vite --port 5173`.
//   node scripts/dev/roll.mjs <out-dir/> a.jpg b.jpg c.jpg
import { chromium } from 'playwright';
const [out = '/tmp/claude-0/shots/', ...files] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport, deviceScaleFactor: name === 'phone' ? 2 : 1 });
  await p.goto('http://localhost:5173/?palette=graphite&theme=day');
  await p.evaluate(() => localStorage.clear());
  await p.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('typewriter'); q.onsuccess = q.onerror = q.onblocked = r; }));
  await p.reload();
  await p.waitForTimeout(600);
  await p.click('.seg button:has-text("Photo")');
  await p.setInputFiles('input[type=file]', files);
  await p.waitForTimeout(1500);
  await p.click('button:has-text("See the page"), button[aria-pressed="false"]:has(svg) >> nth=-3').catch(() => {});
  for (let i = 0; i < files.length; i++) {
    if (i) {
      await p.click('button[aria-label="Next photo"]');
      await p.waitForTimeout(1000);
    }
    await p.screenshot({ path: `${out}roll-${name}-${i + 1}.png` });
    if (name === 'phone') break;
  }
  // back to the first: its caption is still there
  if (name === 'desktop') {
    await p.click('button[aria-label="Previous photo"]');
    await p.click('button[aria-label="Previous photo"]');
    await p.waitForTimeout(800);
    console.log('first caption:', await p.$eval('textarea', (t) => t.value));
  }
  await p.close();
}
await b.close();

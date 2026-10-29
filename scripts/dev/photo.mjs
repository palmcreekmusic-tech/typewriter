// Screenshots of Photo mode: each caption placement and a few borders, on
// the stand-in photo and on a picked one. Needs `vite --port 5173`.
//   node scripts/dev/photo.mjs <out-dir/> [photo.jpg]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '/tmp/claude-0/shots/';
const file = process.argv[3];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function shot(name, { placement, border, vary = 1, viewport = { width: 1280, height: 860 }, pick = false, page = true }) {
  const p = await b.newPage({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  await p.goto('http://localhost:5173/?palette=graphite&theme=day');
  await p.waitForTimeout(600);
  await p.click('button:has-text("Photo")');
  if (pick && file) {
    await p.setInputFiles('input[type=file]', file);
    await p.waitForTimeout(600);
  }
  await p.click('button:has-text("Adjust")');
  await p.waitForTimeout(300);
  await p.click(`#adj-photo button:has-text("${placement}")`);
  await p.selectOption('#adj-photo select', border);
  await p.$eval('#adj-photo input[type=range]', (el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, vary);
  await p.click('button.close');
  await p.waitForTimeout(400);
  if (page) await p.click('button:has-text("See the page")');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}${name}.png` });
  await p.close();
}

await shot('photo-margin-print', { placement: 'Margin', border: 'print' });
await shot('photo-strip-thin', { placement: 'Paper strip', border: 'thin' });
await shot('photo-on-photo-full', { placement: 'On the photo', border: 'full', vary: 1.4 });
await shot('photo-margin-filed', { placement: 'Margin', border: 'filed', vary: 1.6 });
await shot('photo-margin-clean-typing', { placement: 'Margin', border: 'printclean', page: false });
if (file) {
  await shot('photo-picked-margin', { placement: 'Margin', border: 'filedwhite', pick: true });
  await shot('photo-picked-phone', { placement: 'Paper strip', border: 'print', pick: true, viewport: { width: 390, height: 844 } });
}
await b.close();

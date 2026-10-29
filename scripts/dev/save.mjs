// Saves a PNG (paper and ink only) and a PDF through the Save panel, and
// screenshots the panel. Needs `vite --port 5173`.
//   node scripts/dev/save.mjs <out-dir/>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '/tmp/claude-0/shots/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport, deviceScaleFactor: 2, acceptDownloads: true });
  await p.goto('http://localhost:5173/?palette=graphite&theme=day');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(800);
  await p.click('button[title="Save a picture or a PDF"]');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}save-panel${name === 'phone' ? '-phone' : ''}.png` });
  if (name === 'phone') break;
  const grab = async (file) => {
    const [d] = await Promise.all([p.waitForEvent('download'), p.click('button.save')]);
    await d.saveAs(out + file);
    console.log(file, d.suggestedFilename());
    await p.click('button[title="Save a picture or a PDF"]');
  };
  await grab('save-paper.png');
  await p.click('button:has-text("Ink only")');
  await grab('save-ink.png');
  await p.click('button:has-text("PDF")');
  await p.click('button:has-text("On the paper")');
  await grab('save.pdf');
  await p.click('button:has-text("Ink only")');
  await grab('save-ink.pdf');
  await p.close();
}
await b.close();

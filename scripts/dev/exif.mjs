// Screenshots of captions written from a photo's EXIF: the darkroom note it
// writes on opening, and the museum label from the drawer.
// Needs `vite --port 5173`.   node scripts/dev/exif.mjs <out-dir/> <photo-with-exif.jpg>
import { chromium } from 'playwright';
const [out = '/tmp/claude-0/shots/', file] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://localhost:5173/?palette=graphite&theme=day');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(600);
await p.click('.seg button:has-text("Photo")');
await p.setInputFiles('input[type=file]', file);
await p.waitForTimeout(1500);
await p.click('button:has-text("See the page")');
await p.waitForTimeout(1000);
await p.screenshot({ path: `${out}exif-note.png` });
await p.click('button:has-text("Adjust")');
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}exif-drawer.png` });
await p.click('#adj-photo button:has-text("Museum label")');
await p.click('#adj-photo button:has-text("Paper strip")');
await p.click('button.close');
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}exif-label.png` });
await b.close();

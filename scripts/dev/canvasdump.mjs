// Saves the page canvas bitmap itself (no DOM around it), phone letter view.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await m.goto('http://localhost:4173/');
await m.waitForTimeout(1200);
await m.click('text=Letter');
await m.waitForTimeout(1500);
const url = await m.$eval('.sheet canvas', (c) => c.toDataURL());
writeFileSync('/tmp/claude-0/shots/canvas.png', Buffer.from(url.split(',')[1], 'base64'));
await b.close();

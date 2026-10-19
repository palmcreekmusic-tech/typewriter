// Rough typing cost on a full letter at a given master: node scripts/dev/perf.mjs 1
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
await p.goto('http://localhost:4173/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(1200);
await p.click('text=Letter');
await p.$eval('.master input', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, process.argv[2] ?? '1');
await p.waitForTimeout(800);
const t0 = Date.now();
await p.keyboard.type('The quick brown fox jumps over the lazy dog. ', { delay: 0 });
await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
console.log('ms per key', ((Date.now() - t0) / 45).toFixed(1));
await b.close();

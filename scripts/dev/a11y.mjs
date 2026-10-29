// Accessibility checks: axe on the typing view, the drawer and the Save
// panel; a phone at a large text size; and Reduce Motion on. Needs
// `vite --port 5173`.
//   node scripts/dev/a11y.mjs <out-dir/>
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const out = process.argv[2] ?? '/tmp/claude-0/shots/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await p.goto('http://localhost:5173/?palette=graphite&theme=day');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(800);
const check = async (name) => {
  await p.addScriptTag({ content: axe });
  const r = await p.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] }));
  console.log(`${name}: ${r.violations.length} violations`);
  for (const v of r.violations) console.log(`  ${v.impact} ${v.id}: ${v.help} (${v.nodes.length})`, v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | '));
};
await check('typing');
await p.click('button:has-text("Adjust")');
await p.waitForTimeout(200);
await check('drawer');
await p.click('button.close');
await p.click('button[title="Save a picture, a PDF or a video"]');
await check('save panel');
console.log('focus in panel:', await p.evaluate(() => document.activeElement?.className));
await p.keyboard.press('Escape');
console.log('focus back on:', await p.evaluate(() => document.activeElement?.getAttribute('title')));
console.log('sheet transition under Reduce Motion:', await p.$eval('.sheet', (e) => getComputedStyle(e).transitionDuration));
// large text: the interface scales with the root size, as Dynamic Type sets it
const q = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await q.goto('http://localhost:5173/?palette=graphite&theme=day');
await q.addStyleTag({ content: 'html { font-size: 22px !important; }' });
await q.waitForTimeout(600);
await q.screenshot({ path: out + 'a11y-large-text-phone.png' });
await q.click('button[aria-label="Adjust"], button:has-text("Adjust")').catch(() => q.click('.btn[aria-expanded]:last-of-type'));
await q.waitForTimeout(400);
await q.screenshot({ path: out + 'a11y-large-text-drawer.png' });
await b.close();

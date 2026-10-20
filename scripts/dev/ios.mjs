// iPhone-ish run: touch, no canvas filter (like older Safari), keyboard focus checks.
// node scripts/dev/ios.mjs  (needs vite preview on 4173)
import { chromium } from 'playwright';
const out = process.env.OUT ?? '/tmp/claude-0/shots';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const nofilter of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const m = await ctx.newPage();
  const errs = [];
  m.on('pageerror', (e) => errs.push(e.message));
  m.on('console', (c) => c.type() === 'error' && errs.push(c.text()));
  if (nofilter)
    await m.addInitScript(() => {
      for (const P of [CanvasRenderingContext2D.prototype, OffscreenCanvasRenderingContext2D.prototype])
        Object.defineProperty(P, 'filter', { get: () => 'none', set: () => {}, configurable: true });
    });
  await m.goto('http://localhost:4173/');
  await m.waitForTimeout(1500);
  const focused = () => m.evaluate(() => document.activeElement?.tagName);
  console.log(nofilter ? 'no filter' : 'filter', 'after load:', await focused());
  await m.tap('text=Letter');
  console.log(' after mode tap:', await focused());
  await m.tap('text=Adjust');
  await m.waitForTimeout(300);
  await m.tap('.drawer .close');
  console.log(' after drawer close:', await focused());
  const box = await m.locator('.sheet canvas').boundingBox();
  const tx = Math.min(360, Math.max(box.x + 20, 30)), ty = Math.min(box.y + 60, 400);
  console.log(' tapping', await m.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [tx, ty]));
  await m.touchscreen.tap(tx, ty);
  await m.waitForTimeout(200);
  console.log(' after paper tap:', await focused());
  await m.keyboard.type(' Hello');
  await m.waitForTimeout(800);
  await m.screenshot({ path: `${out}/ios-${nofilter ? 'nofilter' : 'filter'}.png` });
  await m.screenshot({ path: `${out}/ios-${nofilter ? 'nofilter' : 'filter'}-zoom.png`, clip: { x: 120, y: 260, width: 200, height: 140 } });
  console.log(' errors:', errs);
  await ctx.close();
}
await b.close();

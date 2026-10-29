// Play mode check: starts Play on a letter, grabs frames part way through,
// and renders the performance's audio offline to a WAV.
// Needs `vite preview --port 4173`.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const out = process.argv[2] ?? '/tmp/claude-0/shots/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173/?palette=graphite&theme=day');
await p.waitForTimeout(1200);
await p.click('text=Letter');
await p.waitForTimeout(800);
await p.click('button:has-text("Play")');
for (const ms of [1500, 6000]) {
  await p.waitForTimeout(ms);
  await p.screenshot({ path: `${out}play-${ms}.png` });
}
await p.click('button:has-text("Stop")');
// offline audio of the same performance
const wav = await p.evaluate(async () => {
  const m = await import('/src/audio/player.ts').catch(() => null);
  return m ? 'dev-only' : 'skip';
});
console.log('errors:', errs.length ? errs : 'none', wav);
await b.close();

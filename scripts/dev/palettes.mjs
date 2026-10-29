// Screenshots of each palette, day and night, desktop and phone, plus a
// contact sheet per palette. Needs `vite preview --port 4173`.
import { chromium } from 'playwright';
const out = process.argv[2] ?? '/tmp/claude-0/shots/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const shots = {};
for (const palette of ['graphite', 'sage', 'oat']) {
  for (const theme of ['day', 'night']) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(`http://localhost:4173/?palette=${palette}&theme=${theme}`);
    await p.waitForTimeout(1300);
    await p.screenshot({ path: `${out}${palette}-${theme}-desktop.png` });
    if (theme === 'day') {
      await p.click('button:has-text("Adjust")');
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${out}${palette}-${theme}-drawer.png` });
    }
    await p.close();
    const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await m.goto(`http://localhost:4173/?palette=${palette}&theme=${theme}`);
    await m.waitForTimeout(1300);
    await m.screenshot({ path: `${out}${palette}-${theme}-phone.png` });
    await m.close();
  }
}
await b.close();

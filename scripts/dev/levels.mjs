// Screenshots for the Typist / Machine split: desktop, phone, and the two
// "who's to blame" extremes on a letter. Needs `vite preview --port 4173`.
import { chromium } from 'playwright';
const out = process.argv[2] ?? '/tmp/claude-0/shots/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
await p.goto('http://localhost:4173/');
await p.waitForTimeout(1500);
await p.screenshot({ path: out + 'levels-desktop.png' });
const set = (page, label, v) =>
  page.evaluate(
    ([label, v]) => {
      const el = document.querySelector(`input[aria-label^="${label}"]`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    [label, v],
  );
await p.click('text=Letter');
await p.waitForTimeout(800);
await set(p, 'Typist', 0.95);
await set(p, 'Machine', 0.05);
await p.waitForTimeout(700);
await p.screenshot({ path: out + 'levels-nervous-typist-good-machine.png' });
await set(p, 'Typist', 0.05);
await set(p, 'Machine', 0.95);
await p.waitForTimeout(700);
await p.screenshot({ path: out + 'levels-skilled-typist-tired-machine.png' });
const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await m.goto('http://localhost:4173/');
await m.waitForTimeout(1500);
await m.screenshot({ path: out + 'levels-phone.png' });
await b.close();

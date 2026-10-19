import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
p.on('console', m => console.log(m.type(), m.text()));
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:4173/');
await p.waitForTimeout(1500);
await b.close();

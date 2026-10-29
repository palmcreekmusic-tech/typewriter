// Screenshots of each printed surface with a caption typed on it.
// Needs `vite --port 5173`.
//   node scripts/dev/surfaces.mjs <out-dir/>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '/tmp/claude-0/shots/';
const TEXTS = {
  'Index card': "Grandma's lemon cake\n2 cups flour, 1 cup sugar\n3 eggs, zest of two lemons\nBake at 350 for 40 minutes.\nDon't open the oven door!",
  Telegram: 'arriving tuesday on the 4:15 stop bring the car stop all my love stop margaret',
  'Gummed label': 'Kodachrome slides\nBig Sur, July 1971\nBox 3 of 5',
  Postcard: 'Dear Ruth,\nThe weather is perfect and the ocean is far too cold. The gulls steal everything.\nWish you were here.\nLove, J.',
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport, deviceScaleFactor: 2 });
  await p.goto('http://localhost:5173/?palette=graphite&theme=day');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(600);
  for (const [surface, text] of Object.entries(TEXTS)) {
    if (name === 'phone' && surface !== 'Postcard') continue;
    await p.click('button:has-text("Adjust")');
    await p.click(`button:has-text("${surface}")`);
    await p.click('button.close');
    await p.fill('textarea', text);
    await p.waitForTimeout(500);
    await p.click('button:has-text("See the page")');
    await p.waitForTimeout(900);
    const slug = surface.split(' ').pop().toLowerCase();
    await p.screenshot({ path: `${out}surface-${slug}${name === 'phone' ? '-phone' : ''}.png` });
    await p.click('button:has-text("Back to typing")');
    if (surface === 'Telegram' && name === 'desktop') await p.screenshot({ path: `${out}surface-telegram-typing.png` });
  }
  await p.close();
}
await b.close();

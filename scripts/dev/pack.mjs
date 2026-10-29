// Checks a recorded pack end to end: lists packs, renders the same
// performance with the synth and with the pack, and screenshots the Sound
// section of the drawer. Needs the dev server (`npx vite --port 5173`).
import { chromium } from 'playwright';
const out = process.argv[2] ?? '/tmp/claude-0/shots/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(1500);
const res = await p.evaluate(async () => {
  const { listPacks } = await import('/src/audio/samples.ts');
  const { perform } = await import('/src/engine/performance.ts');
  const { strikesFor } = await import('/src/engine/strikes.ts');
  const { layoutText } = await import('/src/engine/layout.ts');
  const { defaultSettings } = await import('/src/engine/document.ts');
  const { renderPerformance } = await import('/src/audio/player.ts');
  const packs = await listPacks();
  const s = defaultSettings();
  const layout = layoutText('The light came in low.', 'letter', s.layout);
  const perf = perform({ layout, strikes: strikesFor(layout, s), fixes: new Map(), settings: s });
  const level = (buf) => {
    const d = buf.getChannelData(0);
    let e = 0;
    for (const v of d) e += v * v;
    return +Math.sqrt(e / d.length).toFixed(4);
  };
  const synth = level(await renderPerformance(perf, s.look.machine, s.seed, 48000, null));
  const pack = packs[0] ? level(await renderPerformance(perf, s.look.machine, s.seed, 48000, packs[0])) : null;
  const again = packs[0] ? level(await renderPerformance(perf, s.look.machine, s.seed, 48000, packs[0])) : null;
  const ball = packs[0] ? level(await renderPerformance(perf, 'selectric', s.seed, 48000, packs[0])) : null;
  const ballSynth = level(await renderPerformance(perf, 'selectric', s.seed, 48000, null));
  return { packs: packs.map((x) => x.id), synth, pack, again, ball, ballSynth };
});
console.log(res);
await p.click('button:has-text("Adjust")');
await p.waitForTimeout(400);
await p.click('nav.jump >> text=Sound');
await p.waitForTimeout(700);
await p.screenshot({ path: out + 'sound-drawer.png' });
await b.close();

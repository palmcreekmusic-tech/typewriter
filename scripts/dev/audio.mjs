// Renders a performance's sound offline for each machine and reports the
// level, so a voice that's silent or clipping shows up. Writes WAVs to
// listen to. Needs the dev server (`npx vite --port 5173`).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const out = process.argv[2] ?? '/tmp/claude-0/shots/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.goto('http://localhost:5173/');
await p.waitForTimeout(1500);
const res = await p.evaluate(async () => {
  const { perform } = await import('/src/engine/performance.ts');
  const { strikesFor } = await import('/src/engine/strikes.ts');
  const { layoutText } = await import('/src/engine/layout.ts');
  const { defaultSettings, applyPreset } = await import('/src/engine/document.ts');
  const { renderPerformance, toWav } = await import('/src/audio/player.ts');
  const text = 'Somewhere west of here, 1962. The light came in low across the field this morning and I stood there.';
  const out = {};
  for (const id of ['underwood-1930s', 'hermes-1960s', 'selectric-1970s', 'daisywheel-1980s']) {
    const s = applyPreset(defaultSettings(), id);
    s.mode = 'letter';
    const layout = layoutText(text, 'letter', s.layout);
    const perf = perform({ layout, strikes: strikesFor(layout, s), fixes: new Map(), settings: s });
    const buf = await renderPerformance(perf, s.look.machine, s.seed);
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0;
    for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    const wav = new Uint8Array(await toWav(buf).arrayBuffer());
    let bin = '';
    for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode(...wav.subarray(i, i + 0x8000));
    out[id] = { secs: +buf.duration.toFixed(1), peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), wav: btoa(bin) };
  }
  return out;
});
for (const [id, r] of Object.entries(res)) {
  writeFileSync(`${out}sound-${id}.wav`, Buffer.from(r.wav, 'base64'));
  console.log(id, r.secs + 's', 'peak', r.peak, 'rms', r.rms);
}
await b.close();

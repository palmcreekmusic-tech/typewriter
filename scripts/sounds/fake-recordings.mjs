// Makes a folder of pretend recordings from the synthesiser, to test the
// import script end to end without a real machine. Needs the dev server
// (`npx vite --port 5173`).
//   node scripts/sounds/fake-recordings.mjs <out folder>
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.goto('http://localhost:5173/');
await p.waitForTimeout(1000);
const files = await p.evaluate(async () => {
  const { playBeat, masterBus } = await import('/src/audio/synth.ts');
  const { toWav } = await import('/src/audio/player.ts');
  const take = async (beats, secs) => {
    const off = new OfflineAudioContext(1, secs * 44100, 44100);
    const bus = masterBus(off);
    for (const b of beats) playBeat(off, bus, b, 'underwood', 0, 1);
    const wav = new Uint8Array(await toWav(await off.startRendering()).arrayBuffer());
    let s = '';
    for (let i = 0; i < wav.length; i += 0x8000) s += String.fromCharCode(...wav.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const keys = Array.from({ length: 24 }, (_, i) => ({ t: 0.2 + i * 0.3, sound: 'key', ch: 'asdfjkl'[i % 7], pressure: (i % 6) / 5 }));
  return {
    'keys-take1.wav': await take(keys, 8),
    'space.wav': await take([0, 1, 2].map((i) => ({ t: 0.2 + i * 0.4, sound: 'space', pressure: 0.5 })), 2),
    'bell.wav': await take([{ t: 0.1, sound: 'bell', pressure: 0.6 }], 2),
    'return.wav': await take([{ t: 0.1, sound: 'return', pressure: 0.6, dur: 0.4 }], 2),
  };
});
for (const [f, data] of Object.entries(files)) writeFileSync(`${out}/${f}`, Buffer.from(data, 'base64'));
writeFileSync(`${out}/credits.txt`, 'Synthesised test takes, not a real machine.\n');
console.log('wrote', Object.keys(files).join(', '));
await b.close();

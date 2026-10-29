// Turns typewriter recordings into a sound pack the app can play.
//
//   node scripts/sounds/import.mjs <folder of WAVs> <pack id> ["Pack name"] [typebar|typeball|daisywheel]
//
// Name each recording after what's on it; the start of the file name picks
// the sound (keys-01.wav, keys-hard.wav, space.wav, return-2.wav, bell.wav,
// backspace.wav, shift.wav, feed.wav, linefeed.wav). A file can hold many
// hits: the script finds each one, trims it, and sorts the key strikes into
// soft, normal and hard by how loud they were, so the app can pick one by
// the typist's pressure. Put a credits.txt (licence and source links) in the
// folder and it goes into the pack.
//
// The last argument says what kind of machine it is (a manual or electric
// typebar machine by default, typeball for a Selectric, daisywheel), so the
// app only uses the pack for machines that sound like it.
//
// Writes public/sounds/<pack id>/ with 48 kHz mono WAVs and manifest.json,
// and adds the pack to public/sounds/index.json.

import { mkdirSync, readdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readWav, writeWav, resample } from './wav.mjs';

const SOUNDS = ['keys', 'space', 'return', 'bell', 'backspace', 'shift', 'feed', 'linefeed'];
const RATE = 48000;
// how long each kind of hit may run, seconds
const MAX_LEN = { keys: 0.35, space: 0.4, backspace: 0.3, shift: 0.4, linefeed: 0.4, bell: 1.6, return: 2.5, feed: 3 };
// sounds that are one long event per file rather than many hits
const WHOLE = new Set(['return', 'feed']);

const [src, id, name = id, mech = 'typebar'] = process.argv.slice(2);
if (!src || !id || !['typebar', 'typeball', 'daisywheel'].includes(mech)) {
  console.error('usage: node scripts/sounds/import.mjs <folder of WAVs> <pack id> ["Pack name"] [typebar|typeball|daisywheel]');
  process.exit(1);
}

/** Finds the start of each hit: where the short-term level jumps well above the level just before. */
function onsets(x, rate, minGap = 0.06) {
  const hop = Math.round(rate * 0.002);
  const env = [];
  for (let i = 0; i < x.length; i += hop) {
    let e = 0;
    for (let j = i; j < Math.min(x.length, i + hop); j++) e = Math.max(e, Math.abs(x[j]));
    env.push(e);
  }
  const peak = Math.max(...env);
  const floor = peak * 0.06;
  const hits = [];
  let last = -Infinity;
  for (let k = 4; k < env.length; k++) {
    const before = Math.max(...env.slice(k - 4, k));
    if (env[k] > floor && env[k] > before * 3 && (k - last) * hop > minGap * rate) {
      hits.push(k * hop);
      last = k;
    }
  }
  return hits;
}

/** Cuts one hit: a little before the onset, up to the next hit or the max length, faded at both ends. */
function cut(x, rate, start, end) {
  const a = Math.max(0, start - Math.round(rate * 0.004));
  const seg = x.slice(a, end);
  // trim the quiet tail
  let peak = 0;
  for (const v of seg) peak = Math.max(peak, Math.abs(v));
  let n = seg.length;
  while (n > rate * 0.02 && Math.abs(seg[n - 1]) < peak * 0.01) n--;
  const out = seg.slice(0, n);
  const fin = Math.min(out.length, Math.round(rate * 0.002));
  const fout = Math.min(out.length, Math.round(rate * 0.02));
  for (let i = 0; i < fin; i++) out[i] *= i / fin;
  for (let i = 0; i < fout; i++) out[out.length - 1 - i] *= i / fout;
  return { samples: out, peak };
}

const files = readdirSync(src).filter((f) => f.toLowerCase().endsWith('.wav')).sort();
const hits = Object.fromEntries(SOUNDS.map((s) => [s, []]));
for (const f of files) {
  const sound = SOUNDS.find((s) => basename(f).toLowerCase().startsWith(s));
  if (!sound) {
    console.warn(`skipping ${f}: name it after a sound (${SOUNDS.join(', ')})`);
    continue;
  }
  const { rate, samples } = readWav(join(src, f));
  const x = resample(samples, rate, RATE);
  const starts = WHOLE.has(sound) ? [onsets(x, RATE)[0] ?? 0] : onsets(x, RATE);
  starts.forEach((s, i) => {
    const end = Math.min(x.length, starts[i + 1] ?? x.length, s + Math.round(MAX_LEN[sound] * RATE));
    const h = cut(x, RATE, s, end);
    if (h.samples.length > RATE * 0.015) hits[sound].push(h);
  });
  console.log(`${f}: ${starts.length} ${sound} hit${starts.length === 1 ? '' : 's'}`);
}

// One gain for the whole pack, so loud and soft hits stay loud and soft
const loudest = Math.max(...Object.values(hits).flat().map((h) => h.peak), 1e-6);
const gain = 0.6 / loudest;

const dir = join('public', 'sounds', id);
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(dir, { recursive: true });
const manifest = { id, name, mechanism: mech, credits: existsSync(join(src, 'credits.txt')) ? readFileSync(join(src, 'credits.txt'), 'utf8').trim() : '', sounds: {} };
for (const sound of SOUNDS) {
  const list = hits[sound];
  if (!list.length) continue;
  const save = (h, i) => {
    const file = `${sound}-${String(i + 1).padStart(2, '0')}.wav`;
    writeWav(join(dir, file), h.samples.map((v) => v * gain), RATE);
    return file;
  };
  if (sound === 'keys') {
    // soft, normal, hard: thirds by level
    const sorted = [...list].sort((a, b) => a.peak - b.peak);
    const third = Math.max(1, Math.round(sorted.length / 3));
    const layers = { soft: sorted.slice(0, third), normal: sorted.slice(third, sorted.length - third), hard: sorted.slice(sorted.length - third) };
    if (!layers.normal.length) layers.normal = sorted;
    let i = 0;
    manifest.sounds.keys = Object.fromEntries(Object.entries(layers).map(([k, l]) => [k, l.map((h) => save(h, i++))]));
  } else manifest.sounds[sound] = list.map(save);
}
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const indexPath = join('public', 'sounds', 'index.json');
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : [];
if (!index.includes(id)) index.push(id);
writeFileSync(indexPath, JSON.stringify(index) + '\n');
const counts = Object.entries(manifest.sounds).map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : Object.values(v).map((l) => l.length).join('/')}`);
console.log(`wrote ${dir}: ${counts.join(', ')}`);

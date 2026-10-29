// Tiny WAV reader and writer: PCM 16/24/32-bit and 32-bit float in, 16-bit
// mono out. Enough for slicing typewriter recordings without other tools.
import { readFileSync, writeFileSync } from 'node:fs';

/** Reads a WAV file and mixes it down to mono floats. */
export function readWav(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not a WAV file`);
  let fmt = null;
  let data = null;
  for (let o = 12; o + 8 <= b.length; ) {
    const id = b.toString('ascii', o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = b.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`${path}: missing fmt or data`);
  // WAVE_FORMAT_EXTENSIBLE keeps the real format in the sub-format GUID; treat by bit depth
  const float = fmt.format === 3 || (fmt.format === 0xfffe && b.readUInt16LE(b.indexOf('fmt ') + 32) === 3);
  const step = fmt.bits / 8;
  const frames = Math.floor(data.length / (step * fmt.channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const o = (i * fmt.channels + c) * step;
      let v;
      if (float) v = data.readFloatLE(o);
      else if (fmt.bits === 16) v = data.readInt16LE(o) / 32768;
      else if (fmt.bits === 24) v = data.readIntLE(o, 3) / 8388608;
      else if (fmt.bits === 32) v = data.readInt32LE(o) / 2147483648;
      else if (fmt.bits === 8) v = (data[o] - 128) / 128;
      else throw new Error(`${path}: ${fmt.bits}-bit audio isn't supported`);
      sum += v;
    }
    out[i] = sum / fmt.channels;
  }
  return { rate: fmt.rate, samples: out };
}

/** Writes mono floats as a 16-bit WAV. */
export function writeWav(path, samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  writeFileSync(path, b);
}

/** Linear resample, fine for short percussive hits. */
export function resample(samples, from, to) {
  if (from === to) return samples;
  const n = Math.round((samples.length * to) / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * from) / to;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = (samples[j] ?? 0) * (1 - f) + (samples[j + 1] ?? 0) * f;
  }
  return out;
}

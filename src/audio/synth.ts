// Typewriter sounds made from scratch with Web Audio: no recordings, no
// licensing, and every strike a little different. Each machine has its own
// voice (a heavy Underwood thunk, a crisp Olympia, a Selectric's ball and
// motor, a daisywheel's tick), and every sound reads the beat's pressure,
// so a key that printed dark also lands loud.
//
// The same code schedules into a live AudioContext (typing, Play) and an
// OfflineAudioContext (video export), so what you hear is what you export.

import type { Beat } from '../engine/performance';
import type { MachineStyle } from '../engine/types';
import { hash, rngFor, type Rng } from '../engine/rng';

export interface Voice {
  /** body resonance of a key strike, Hz */
  body: number;
  /** how long the body rings, seconds */
  ring: number;
  /** brightness of the strike click, Hz */
  click: number;
  /** overall level */
  level: number;
  /** a motor hums while the machine is on */
  motor?: boolean;
  /** a daisywheel's quick tick-tack instead of a typebar */
  wheel?: boolean;
  /** pitch of the margin bell, Hz (0 = no bell, the machine beeps instead) */
  bell: number;
}

export const VOICES: Record<MachineStyle, Voice> = {
  underwood: { body: 150, ring: 0.09, click: 2600, level: 1, bell: 1980 },
  royal: { body: 185, ring: 0.075, click: 3000, level: 0.95, bell: 2150 },
  olympia: { body: 215, ring: 0.06, click: 3600, level: 0.9, bell: 2350 },
  hermes: { body: 235, ring: 0.055, click: 3300, level: 0.8, bell: 2250 },
  selectric: { body: 260, ring: 0.05, click: 4200, level: 0.85, motor: true, bell: 0 },
  electronic: { body: 520, ring: 0.03, click: 5200, level: 0.7, wheel: true, bell: 0 },
};

type Ctx = BaseAudioContext;

const noiseCache = new WeakMap<Ctx, AudioBuffer>();
function noise(ctx: Ctx): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = rngFor(7, 'noise');
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** A burst of filtered noise with a fast attack and an exponential tail. */
function burst(ctx: Ctx, out: AudioNode, t: number, o: { type: BiquadFilterType; f: number; q?: number; gain: number; decay: number; attack?: number; offset?: number }) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.value = o.f;
  f.Q.value = o.q ?? 0.8;
  const g = ctx.createGain();
  const a = o.attack ?? 0.0015;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain, t + a);
  g.gain.setTargetAtTime(0, t + a, o.decay / 3);
  src.connect(f).connect(g).connect(out);
  src.start(t, o.offset ?? 0);
  src.stop(t + a + o.decay * 2.5);
}

/** A short pitched thump that drops a little as it dies away. */
function thump(ctx: Ctx, out: AudioNode, t: number, freq: number, gain: number, decay: number, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq * 1.25, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.setTargetAtTime(0, t + 0.002, decay / 3);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + decay * 2.5);
}

function strike(ctx: Ctx, out: AudioNode, t: number, v: Voice, p: number, r: Rng, ch = '') {
  // each key has its own slug and linkage, so it rings a touch differently
  const k = (hash(ch) % 1000) / 1000;
  const loud = v.level * (0.35 + 0.75 * p);
  if (v.wheel) {
    // hammer on a plastic petal, then the wheel stepping on
    burst(ctx, out, t, { type: 'bandpass', f: v.click * (0.9 + 0.2 * k), q: 2, gain: 0.5 * loud, decay: 0.008 });
    thump(ctx, out, t, v.body * (0.95 + 0.1 * k), 0.25 * loud, v.ring);
    burst(ctx, out, t + 0.03, { type: 'bandpass', f: 2600, q: 3, gain: 0.08 * loud, decay: 0.01 });
    return;
  }
  // the slug hitting the ribbon and paper on the platen
  burst(ctx, out, t, { type: 'highpass', f: v.click * (0.85 + 0.35 * p + 0.1 * k), gain: 0.55 * loud, decay: 0.012 + 0.006 * r() });
  burst(ctx, out, t, { type: 'lowpass', f: 600 + 500 * p, gain: 0.5 * loud, decay: 0.03 });
  thump(ctx, out, t, v.body * (0.92 + 0.16 * k) * (0.97 + 0.06 * r()), 0.55 * loud, v.ring * (0.9 + 0.2 * r()));
  // the typebar falling back into the basket and the escapement letting go
  if (!v.motor) burst(ctx, out, t + 0.045 + 0.02 * r(), { type: 'bandpass', f: 1500 + 600 * k, q: 1.5, gain: 0.12 * loud, decay: 0.015 });
  burst(ctx, out, t + 0.018, { type: 'bandpass', f: 4200, q: 4, gain: 0.07 * loud, decay: 0.006 });
}

function ratchet(ctx: Ctx, out: AudioNode, t: number, n: number, every: number, gain: number) {
  for (let i = 0; i < n; i++) burst(ctx, out, t + i * every, { type: 'bandpass', f: 2400, q: 2.5, gain, decay: 0.008 });
}

function bell(ctx: Ctx, out: AudioNode, t: number, v: Voice, p: number) {
  if (!v.bell) {
    // electric machines beep at the margin instead
    const o = ctx.createOscillator();
    o.frequency.value = 1760;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.005);
    g.gain.setValueAtTime(0.06, t + 0.09);
    g.gain.linearRampToValueAtTime(0, t + 0.1);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.12);
    return;
  }
  // a small struck bell: a few inharmonic partials, the high ones dying first
  const partials: [number, number, number][] = [
    [1, 0.22, 1.4],
    [2.76, 0.1, 0.6],
    [5.4, 0.05, 0.25],
    [8.9, 0.02, 0.12],
  ];
  for (const [m, a, d] of partials) {
    const o = ctx.createOscillator();
    o.frequency.value = v.bell * m;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a * (0.7 + 0.5 * p), t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.002, d / 3);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + d * 2.5);
  }
  burst(ctx, out, t, { type: 'highpass', f: 5000, gain: 0.08, decay: 0.006 });
}

/** The carriage running back: the lever's clicks, the slide, the stop. */
function carriage(ctx: Ctx, out: AudioNode, t: number, v: Voice, dur: number, p: number, feed = true) {
  if (feed && !v.wheel) ratchet(ctx, out, t, 2, 0.035, 0.25 * v.level);
  const start = t + (feed ? 0.07 : 0);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = v.wheel ? 3 : 1.2;
  f.frequency.setValueAtTime(v.wheel ? 1800 : 900, start);
  f.frequency.linearRampToValueAtTime(v.wheel ? 2400 : 600, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(0.12 * v.level, start + 0.03);
  g.gain.setValueAtTime(0.12 * v.level, start + Math.max(0.04, dur - 0.03));
  g.gain.linearRampToValueAtTime(0, start + dur);
  src.connect(f).connect(g).connect(out);
  src.start(start, 0.3);
  src.stop(start + dur + 0.05);
  // the carriage hitting the margin stop
  thump(ctx, out, start + dur, v.body * 0.6, 0.6 * v.level * (0.6 + 0.5 * p), 0.12);
  burst(ctx, out, start + dur, { type: 'lowpass', f: 900, gain: 0.45 * v.level, decay: 0.05 });
}

/** Schedules one beat. `at` is the context time of the performance's start. */
export function playBeat(ctx: Ctx, out: AudioNode, b: Beat, machine: MachineStyle, at: number, seed: number) {
  const v = VOICES[machine];
  const t = at + b.t;
  const r = rngFor(seed, 'sound', Math.round(b.t * 1000));
  const p = b.pressure;
  switch (b.sound) {
    case 'key':
      strike(ctx, out, t, v, p, r, b.ch);
      break;
    case 'space':
      // the space bar moves the carriage without a slug hitting the paper
      thump(ctx, out, t, v.body * 0.7, 0.25 * v.level * (0.5 + p), v.ring * 1.4);
      burst(ctx, out, t, { type: 'bandpass', f: 1800, q: 1.2, gain: 0.14 * v.level, decay: 0.012 });
      break;
    case 'tab':
      carriage(ctx, out, t, v, 0.12, p, false);
      break;
    case 'shift':
      // the whole basket lifting
      thump(ctx, out, t, 95, 0.3 * v.level, 0.08);
      burst(ctx, out, t, { type: 'lowpass', f: 500, gain: 0.2 * v.level, decay: 0.04 });
      break;
    case 'backspace':
      burst(ctx, out, t, { type: 'bandpass', f: 2000, q: 1.5, gain: 0.25 * v.level, decay: 0.012 });
      thump(ctx, out, t, v.body * 1.3, 0.15 * v.level, 0.04);
      break;
    case 'return':
      carriage(ctx, out, t, v, b.dur ?? 0.3, p);
      break;
    case 'linefeed':
      ratchet(ctx, out, t, 2, 0.035, 0.22 * v.level);
      break;
    case 'bell':
      bell(ctx, out, t, v, p);
      break;
    case 'feed': {
      // turning the platen knob to wind a fresh sheet in
      const d = b.dur ?? 1.4;
      ratchet(ctx, out, t, Math.round(d / 0.06), 0.06, 0.18 * v.level);
      burst(ctx, out, t, { type: 'highpass', f: 3000, gain: 0.05, decay: d, attack: 0.1 });
      break;
    }
    case 'brush': {
      // a few strokes of a whiteout brush
      const d = b.dur ?? 0.7;
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) burst(ctx, out, t + (i * d) / n, { type: 'bandpass', f: 3500 + 1500 * r(), q: 0.8, gain: 0.05, decay: d / n, attack: 0.03 });
      break;
    }
    case 'slip':
      burst(ctx, out, t, { type: 'highpass', f: 2500, gain: 0.07, decay: b.dur ?? 0.4, attack: 0.04 });
      break;
  }
}

/** A Selectric's motor: a low hum and a faint whirr, for as long as the machine is on. */
export function motorHum(ctx: Ctx, out: AudioNode, from: number, to?: number): () => void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, from);
  g.gain.linearRampToValueAtTime(0.045, from + 0.6);
  const nodes: AudioScheduledSourceNode[] = [];
  for (const [f, a] of [
    [60, 1],
    [120, 0.6],
    [180, 0.25],
  ] as const) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = a;
    o.connect(og).connect(g);
    nodes.push(o);
  }
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'bandpass';
  lp.frequency.value = 420;
  lp.Q.value = 1.5;
  const ng = ctx.createGain();
  ng.gain.value = 0.5;
  src.connect(lp).connect(ng).connect(g);
  nodes.push(src);
  g.connect(out);
  for (const n of nodes) {
    n.start(from);
    if (to !== undefined) n.stop(to);
  }
  if (to !== undefined) g.gain.setTargetAtTime(0, to - 0.4, 0.15);
  return () => {
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(0, now, 0.15);
    for (const n of nodes) n.stop(now + 0.8);
  };
}

/** The end of every chain: a gentle compressor so a hard key never clips. */
export function masterBus(ctx: Ctx, volume = 0.8): AudioNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.002;
  comp.release.value = 0.12;
  const g = ctx.createGain();
  g.gain.value = volume;
  comp.connect(g).connect(ctx.destination);
  return comp;
}

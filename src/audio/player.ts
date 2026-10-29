// Plays the sounds: one live AudioContext for typing and Play, and an
// offline render of a whole performance for export. The browser only lets
// sound start after a tap or a key press, so the context wakes on the first
// one.

import type { Beat, Performance } from '../engine/performance';
import type { MachineStyle } from '../engine/types';
import { masterBus, motorHum, playBeat } from './synth';
import { loadPack, playSample, RoundRobin, type Pack, type PackManifest } from './samples';
import { mechanism } from '../engine/flaws';

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let volume = 0.8;

/** Live volume, 0..1. Exports always render at full level. */
export function setVolume(v: number) {
  volume = v;
  if (bus) bus.gain.value = v;
}

// The recorded pack in use, if any, decoded for the live context.
let packManifest: PackManifest | null = null;
let livePack: Pack | null = null;
let liveRR = new RoundRobin();

/** Picks a recorded pack (or null for the synthesiser). */
export async function usePack(m: PackManifest | null) {
  packManifest = m;
  livePack = null;
  liveRR = new RoundRobin();
  if (m && ctx) {
    const p = await loadPack(ctx, m);
    if (packManifest === m) livePack = p;
  }
}

/** A pack only stands in for the kind of machine it was recorded on. */
const fits = (m: PackManifest | null, machine: MachineStyle) => !!m && (m.mechanism ?? 'typebar') === mechanism(machine);

function emit(c: BaseAudioContext, out: AudioNode, b: Beat, machine: MachineStyle, at: number, seed: number, pack: Pack | null, rr: RoundRobin) {
  if (pack && fits(pack.manifest, machine) && playSample(c, out, pack, b, at, seed, rr)) return;
  playBeat(c, out, b, machine, at, seed);
}

function live(): { ctx: AudioContext; bus: AudioNode } | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    bus = ctx.createGain();
    bus.gain.value = volume;
    bus.connect(masterBus(ctx, 1));
    if (packManifest) void usePack(packManifest);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, bus: bus! };
}

/** One sound right now, for a key you just pressed. */
export function playNow(b: Omit<Beat, 't'>, machine: MachineStyle, seed: number) {
  const l = live();
  if (!l) return;
  emit(l.ctx, l.bus, { ...b, t: 0 }, machine, l.ctx.currentTime + 0.005, seed, livePack, liveRR);
}

let hum: (() => void) | null = null;
let humTimer: ReturnType<typeof setTimeout> | undefined;
/** A Selectric hums while you type and winds down after a quiet spell. */
export function keepMotorRunning(machine: MachineStyle) {
  if (machine !== 'selectric') return stopMotor();
  const l = live();
  if (!l) return;
  if (!hum) hum = motorHum(l.ctx, l.bus, l.ctx.currentTime);
  clearTimeout(humTimer);
  humTimer = setTimeout(stopMotor, 6000);
}
function stopMotor() {
  clearTimeout(humTimer);
  hum?.();
  hum = null;
}

/** Starts a whole performance; returns a stop function and the context clock to follow. */
export function playPerformance(perf: Performance, machine: MachineStyle, seed: number): { stop: () => void; now: () => number } | null {
  const l = live();
  if (!l) return null;
  // its own gain, so stopping silences everything already scheduled
  const g = l.ctx.createGain();
  g.connect(l.bus);
  const at = l.ctx.currentTime + 0.08;
  const rr = new RoundRobin();
  for (const b of perf.beats) emit(l.ctx, g, b, machine, at, seed, livePack, rr);
  let stopHum: (() => void) | null = null;
  if (machine === 'selectric') stopHum = motorHum(l.ctx, g, at - 0.05, at + perf.duration);
  return {
    stop: () => {
      g.gain.setTargetAtTime(0, l.ctx.currentTime, 0.02);
      stopHum?.();
      setTimeout(() => g.disconnect(), 200);
    },
    now: () => l.ctx.currentTime - at,
  };
}

/** Renders a performance to an audio buffer, faster than real time. */
export async function renderPerformance(perf: Performance, machine: MachineStyle, seed: number, sampleRate = 48000, pack: PackManifest | null = packManifest): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(2, Math.ceil((perf.duration + 0.5) * sampleRate), sampleRate);
  const out = masterBus(off);
  const p = fits(pack, machine) ? await loadPack(off, pack!) : null;
  const rr = new RoundRobin();
  for (const b of perf.beats) emit(off, out, b, machine, 0, seed, p, rr);
  if (machine === 'selectric') motorHum(off, out, 0, perf.duration);
  return off.startRendering();
}

/** 16-bit PCM WAV, for the PNG-sequence-plus-WAV export. */
export function toWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  data.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVEfmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  str(36, 'data');
  data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Blob([data], { type: 'audio/wav' });
}

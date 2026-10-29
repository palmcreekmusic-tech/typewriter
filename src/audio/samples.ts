// Recorded sound packs ("Real machine"). A pack is a folder under
// public/sounds/ made by scripts/sounds/import.mjs: short WAV hits and a
// manifest that sorts the key strikes into soft, normal and hard.
//
// Each strike picks the layer by the typist's pressure, then a take from
// that layer that isn't the one just played (round-robin), with a hair of
// pitch and level variation. Choices come from the seed, so a performance
// sounds the same every time it's played or exported.
//
// A pack belongs to one kind of machine; a Selectric never borrows an
// Underwood's recordings. Anything a pack lacks falls back to the synth.

import type { Beat, Sound } from '../engine/performance';
import type { Mechanism } from '../engine/flaws';
import { rngFor } from '../engine/rng';

export interface PackManifest {
  id: string;
  name: string;
  credits: string;
  /** which machines it can stand in for */
  mechanism?: Mechanism;
  sounds: {
    keys?: { soft: string[]; normal: string[]; hard: string[] };
  } & Partial<Record<Exclude<Sound, 'key'>, string[]>>;
}

export interface Pack {
  manifest: PackManifest;
  layers: Partial<Record<string, AudioBuffer[]>>;
}

const BASE = './sounds/';

/** The packs this build ships, if any. */
export async function listPacks(): Promise<PackManifest[]> {
  try {
    const res = await fetch(`${BASE}index.json`);
    if (!res.ok) return [];
    const ids = (await res.json()) as string[];
    const all = await Promise.all(ids.map((id) => fetch(`${BASE}${id}/manifest.json`).then((r) => (r.ok ? (r.json() as Promise<PackManifest>) : null))));
    return all.filter((m): m is PackManifest => !!m);
  } catch {
    return [];
  }
}

// raw file bytes, kept so each audio context (live, export) can decode its own copy
const bytes = new Map<string, Promise<ArrayBuffer>>();
function fetchBytes(url: string) {
  let p = bytes.get(url);
  if (!p) bytes.set(url, (p = fetch(url).then((r) => r.arrayBuffer())));
  return p;
}

export async function loadPack(ctx: BaseAudioContext, m: PackManifest): Promise<Pack> {
  const layers: Pack['layers'] = {};
  const decode = (files: string[]) => Promise.all(files.map(async (f) => ctx.decodeAudioData((await fetchBytes(`${BASE}${m.id}/${f}`)).slice(0))));
  const { keys, ...rest } = m.sounds;
  const jobs: Promise<void>[] = [];
  if (keys) for (const k of ['soft', 'normal', 'hard'] as const) if (keys[k]?.length) jobs.push(decode(keys[k]).then((b) => void (layers[`key-${k}`] = b)));
  for (const [sound, files] of Object.entries(rest)) if (files?.length) jobs.push(decode(files).then((b) => void (layers[sound] = b)));
  await Promise.all(jobs);
  return { manifest: m, layers };
}

/** Remembers the last take of each layer, so the same one never plays twice running. */
export class RoundRobin {
  private last = new Map<string, number>();
  pick(layer: string, n: number, r: () => number): number {
    if (n <= 1) return 0;
    const prev = this.last.get(layer) ?? -1;
    let i = Math.floor(r() * (n - 1));
    if (i >= prev && prev >= 0) i++;
    this.last.set(layer, i);
    return i;
  }
}

function layerFor(pack: Pack, b: Beat): { name: string; within: number } | null {
  if (b.sound === 'key') {
    // soft below a third, hard above two thirds; fall back to whatever layers exist
    const want = b.pressure < 0.33 ? 'soft' : b.pressure < 0.66 ? 'normal' : 'hard';
    const order = { soft: ['soft', 'normal', 'hard'], normal: ['normal', 'soft', 'hard'], hard: ['hard', 'normal', 'soft'] }[want];
    const got = order.find((k) => pack.layers[`key-${k}`]?.length);
    if (!got) return null;
    const lo = got === 'soft' ? 0 : got === 'normal' ? 0.33 : 0.66;
    return { name: `key-${got}`, within: Math.max(0, Math.min(1, (b.pressure - lo) / 0.34)) };
  }
  return pack.layers[b.sound]?.length ? { name: b.sound, within: b.pressure } : null;
}

/** Plays a beat from the pack; false when the pack has nothing for it. */
export function playSample(ctx: BaseAudioContext, out: AudioNode, pack: Pack, b: Beat, at: number, seed: number, rr: RoundRobin): boolean {
  const l = layerFor(pack, b);
  if (!l) return false;
  const takes = pack.layers[l.name]!;
  const r = rngFor(seed, 'take', l.name, Math.round(b.t * 1000));
  const src = ctx.createBufferSource();
  src.buffer = takes[rr.pick(l.name, takes.length, r)];
  // the same key never lands quite the same way twice
  src.playbackRate.value = 1 + (r() - 0.5) * 0.03;
  const g = ctx.createGain();
  g.gain.value = 0.75 + 0.5 * l.within;
  src.connect(g).connect(out);
  src.start(at + b.t);
  return true;
}

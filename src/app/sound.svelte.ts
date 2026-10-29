// Sound preferences, kept in this browser: on or off, which voice, how loud.
import type { PackManifest } from '../audio/samples';
import { listPacks } from '../audio/samples';
import { setVolume, usePack } from '../audio/player';

const KEY = 'typewriter.sound';

function read(): { on: boolean; pack: string; volume: number } {
  try {
    const raw = localStorage.getItem(KEY);
    // before packs, this held just 'on' or 'off'
    if (raw === 'on' || raw === 'off' || !raw) return { on: raw !== 'off', pack: '', volume: 0.8 };
    const v = JSON.parse(raw);
    return { on: v.on !== false, pack: typeof v.pack === 'string' ? v.pack : '', volume: typeof v.volume === 'number' ? v.volume : 0.8 };
  } catch {
    return { on: true, pack: '', volume: 0.8 };
  }
}

export const sound = $state({ ...read(), packs: [] as PackManifest[] });

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ on: sound.on, pack: sound.pack, volume: sound.volume }));
  } catch {
    /* storage unavailable */
  }
}

/** Loads the list of recorded packs and the one you last picked. */
export async function initSound() {
  setVolume(sound.volume);
  sound.packs = await listPacks();
  const m = sound.packs.find((p) => p.id === sound.pack) ?? null;
  if (!m) sound.pack = '';
  await usePack(m);
}

export function setSoundOn(on: boolean) {
  sound.on = on;
  save();
}

export function setSoundPack(id: string) {
  sound.pack = id;
  save();
  void usePack(sound.packs.find((p) => p.id === id) ?? null);
}

export function setSoundVolume(v: number) {
  sound.volume = v;
  setVolume(v);
  save();
}

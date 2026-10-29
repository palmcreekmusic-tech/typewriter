// Key quirks: the particular faults of one machine. On a real typewriter the
// same slug is damaged every time, so a faint "e" is faint all down the page.
// Every machine style ships with its own set, "Surprise me" deals a random
// one, and you can add, change or remove quirks by hand.
//
// The "Key quirks" flaw slider scales how strongly all of them show.

import type { MachineStyle } from './types';
import { rngFor } from './rng';

export type QuirkKind = 'faint' | 'topfade' | 'high' | 'low' | 'crooked' | 'clogged' | 'heavy' | 'chipped' | 'sticky';

export interface Quirk {
  /** the key, exactly as typed (case matters: "e" and "E" are different slugs) */
  ch: string;
  kind: QuirkKind;
  /** 0..1 */
  amount: number;
}

export const QUIRK_KINDS: { kind: QuirkKind; label: string }[] = [
  { kind: 'faint', label: 'Prints faint' },
  { kind: 'topfade', label: 'Top fades out' },
  { kind: 'high', label: 'Sits high' },
  { kind: 'low', label: 'Sits low' },
  { kind: 'crooked', label: 'Leans' },
  { kind: 'clogged', label: 'Clogged with ink' },
  { kind: 'heavy', label: 'Hits too hard' },
  { kind: 'chipped', label: 'Chipped slug' },
  { kind: 'sticky', label: 'Sticks, double prints' },
];

const q = (ch: string, kind: QuirkKind, amount: number): Quirk => ({ ch, kind, amount });

/** Each machine's own character, the same on every page. */
export const MACHINE_QUIRKS: Record<MachineStyle, Quirk[]> = {
  underwood: [q('e', 'faint', 0.7), q('t', 'high', 0.6), q('o', 'clogged', 0.8), q('a', 'clogged', 0.5), q('r', 'chipped', 0.6), q('s', 'crooked', 0.5), q('n', 'topfade', 0.5)],
  royal: [q('h', 'low', 0.55), q('e', 'clogged', 0.6), q('n', 'faint', 0.5), q('.', 'heavy', 0.7), q('k', 'sticky', 0.6), q('W', 'crooked', 0.5)],
  olympia: [q('i', 'high', 0.35), q('m', 'topfade', 0.5), q('g', 'clogged', 0.45), q('l', 'crooked', 0.3)],
  hermes: [q('e', 'topfade', 0.4), q('a', 'clogged', 0.4), q('y', 'low', 0.35), q('d', 'faint', 0.35)],
  selectric: [q('d', 'faint', 0.3), q('o', 'clogged', 0.2)],
  electronic: [q('s', 'faint', 0.2)],
};

const COMMON = 'etaoinshrdlucmfwypgb.,';

/** A random set of faults for a machine nobody has met before. */
export function surpriseQuirks(seed: number): Quirk[] {
  const r = rngFor(seed, 'surprise-quirks');
  const n = 3 + Math.floor(r() * 6);
  const used = new Set<string>();
  const out: Quirk[] = [];
  while (out.length < n) {
    // favour common letters so the faults actually show up
    const ch = COMMON[Math.floor(r() * r() * COMMON.length)];
    if (used.has(ch)) continue;
    used.add(ch);
    const kind = QUIRK_KINDS[Math.floor(r() * QUIRK_KINDS.length)].kind;
    out.push(q(ch, kind, Math.round((0.35 + 0.65 * r()) * 100) / 100));
  }
  return out;
}

/** Quirks that apply to one key, already scaled by the overall slider. */
export function quirksFor(list: Quirk[], ch: string, scale: number): Partial<Record<QuirkKind, number>> {
  const out: Partial<Record<QuirkKind, number>> = {};
  for (const x of list) if (x.ch === ch) out[x.kind] = Math.min(1.5, (out[x.kind] ?? 0) + x.amount * scale);
  return out;
}

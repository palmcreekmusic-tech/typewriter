// Mistakes and corrections. The text itself always stays the clean version;
// a correction says "this character was first typed as something else, then
// fixed". They come from two places:
//  - automatic typos, dealt from the seed at the mistake rate (a slipped
//    finger hits a neighbouring key)
//  - your own backspaces: delete a letter and type a new one in its place,
//    and the old one stays under the whiteout (see trackEdit)

import type { Layout } from './layout';
import { rngFor } from './rng';

export type FixStyle = 'whiteout' | 'correction-paper' | 'tape' | 'liftoff';

export const FIX_STYLES: { style: FixStyle; label: string }[] = [
  { style: 'whiteout', label: 'Whiteout' },
  { style: 'correction-paper', label: 'Correction paper' },
  { style: 'tape', label: 'Cover-up tape' },
  { style: 'liftoff', label: 'Lift-off (nearly invisible)' },
];

export interface CorrectionSettings {
  style: FixStyle;
  /** keep your own backspaced letters under the correction */
  keepBackspaces: boolean;
  /** 0 neat dab .. 1 sloppy blob that spills onto the neighbours */
  mess: number;
  /** 0 fully covered .. 1 the old letter ghosts through */
  showThrough: number;
  /** 0 waited for it to dry .. 1 typed while wet and smudged it */
  rush: number;
  /** 0 fresh .. 1 yellowed and cracked */
  age: number;
}

export function defaultCorrections(style: FixStyle = 'whiteout'): CorrectionSettings {
  return { style, keepBackspaces: true, mess: 0.35, showThrough: 0.3, rush: 0.1, age: 0 };
}

/** One fixed character: source text index and what was typed there first. */
export interface Fix {
  index: number;
  wrong: string;
}

// Neighbouring keys on a QWERTY board, for believable slips.
const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
const NEIGHBOURS = new Map<string, string>();
ROWS.forEach((row, r) => {
  [...row].forEach((ch, c) => {
    let n = '';
    for (const dr of [-1, 0, 1]) {
      const rr = ROWS[r + dr];
      if (!rr) continue;
      for (const dc of [-1, 0, 1]) {
        if (!dr && !dc) continue;
        const x = rr[c + dc];
        if (x && /[a-z]/.test(x)) n += x;
      }
    }
    NEIGHBOURS.set(ch, n);
  });
});

/** A slipped finger: a neighbouring key, keeping the case. */
export function slip(ch: string, r: () => number): string | null {
  const lower = ch.toLowerCase();
  const n = NEIGHBOURS.get(lower);
  if (!n) return null;
  const x = n[Math.floor(r() * n.length)];
  return ch === lower ? x : x.toUpperCase();
}

/**
 * Random typos for this text. Keyed by the letter and how many times it has
 * appeared so far, so typing more never moves the earlier mistakes.
 */
export function autoFixes(layout: Layout, seed: number, rate: number): Fix[] {
  if (rate <= 0) return [];
  const p = 0.12 * rate ** 1.3;
  const seen = new Map<string, number>();
  const out: Fix[] = [];
  for (const c of layout.cells) {
    if (!/[A-Za-z]/.test(c.ch)) continue;
    const n = seen.get(c.ch) ?? 0;
    seen.set(c.ch, n + 1);
    const r = rngFor(seed, 'typo', c.ch, n);
    if (r() >= p) continue;
    const wrong = slip(c.ch, r);
    if (wrong) out.push({ index: c.index, wrong });
  }
  return out;
}

/** Your backspaces, plus the "deleted but not yet retyped" letters waiting for a replacement. */
export interface EditMemory {
  fixes: Fix[];
  /** stack of deleted letters, most recent (lowest index) last */
  pending: Fix[];
}

export const emptyMemory = (): EditMemory => ({ fixes: [], pending: [] });

/**
 * Updates the backspace memory for one edit from `before` to `after`.
 * Deleting a letter remembers it; typing a new letter into that same spot
 * turns it into a correction. Other edits just shift the remembered spots.
 */
export function trackEdit(mem: EditMemory, before: string, after: string): EditMemory {
  if (before === after) return mem;
  // common prefix and suffix give the changed span
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const removed = before.slice(p, before.length - s);
  const added = after.slice(p, after.length - s);
  const shift = added.length - removed.length;

  // existing fixes: drop the ones whose letter was removed, shift the rest
  let fixes = mem.fixes
    .filter((f) => f.index < p || f.index >= p + removed.length)
    .map((f) => (f.index >= p + removed.length ? { ...f, index: f.index + shift } : f));
  let pending = mem.pending;

  if (removed.length === 1 && added.length === 0 && removed.trim()) {
    // a backspace or delete: remember the letter if it continues the streak
    const top = pending[pending.length - 1];
    pending = top && top.index === p + 1 ? [...pending, { index: p, wrong: removed }] : [{ index: p, wrong: removed }];
  } else if (removed.length === 0 && added.length === 1) {
    const top = pending[pending.length - 1];
    if (top && top.index === p) {
      pending = pending.slice(0, -1);
      if (added !== top.wrong && added.trim()) fixes = [...fixes, { index: p, wrong: top.wrong }];
    } else pending = [];
  } else if (removed.length === 1 && added.length === 1 && removed.trim() && added.trim()) {
    // a selected letter typed over
    fixes = [...fixes, { index: p, wrong: removed }];
    pending = [];
  } else {
    pending = [];
  }
  return { fixes, pending };
}

/** The correction style a preset's era used. */
export function presetFixStyle(c: string): FixStyle {
  return c === 'tape' ? 'tape' : c === 'correction-paper' ? 'correction-paper' : 'whiteout';
}

/** All the corrections on the page, by source index. Your own win over random ones. */
export function allFixes(auto: Fix[], mine: Fix[], text: string): Map<number, Fix> {
  const m = new Map<number, Fix>();
  for (const f of auto) m.set(f.index, f);
  for (const f of mine) if (f.index < text.length) m.set(f.index, f);
  return m;
}

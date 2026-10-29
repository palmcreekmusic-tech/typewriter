// The typing timeline: what was actually typed, in order, as opposed to the
// clean text you see in the box. Most of the time they're the same. They
// differ when a typist x-es out a mistake: the wrong word goes down, x's go
// over it, and the right word follows. Sound and Play mode will read the
// same timeline later.

import { rngFor } from './rng';
import type { Fix } from './corrections';

/** A mistyped word left on the page and marked out, with the right word typed after it. */
export interface Strikeout {
  /** source index of the word the typist got wrong */
  index: number;
  /** what they typed before they noticed */
  wrong: string;
  /** the mark typed over it: x for an x-out, - for a strikethrough */
  mark: string;
}

export interface Typed {
  text: string;
  /** source index of each typed character, -1 for ones not in the clean text */
  src: number[];
  /** a character typed over this one in the same spot */
  over: (string | undefined)[];
  /** typed position of each source index, plus the end */
  pos: number[];
}

/** The typed sequence for a text with some words marked out. */
export function typingScript(text: string, outs: Strikeout[]): Typed {
  const at = new Map(outs.map((o) => [o.index, o]));
  const t: Typed = { text: '', src: [], over: [], pos: new Array(text.length + 1) };
  const push = (ch: string, src: number, over?: string) => {
    t.text += ch;
    t.src.push(src);
    t.over.push(over);
  };
  for (let i = 0; i < text.length; i++) {
    const o = at.get(i);
    if (o) {
      for (const ch of o.wrong) push(ch, -1, o.mark);
      push(' ', -1);
    }
    t.pos[i] = t.text.length;
    push(text[i], i);
  }
  t.pos[text.length] = t.text.length;
  return t;
}

const isWord = (c: string | undefined) => !!c && /\S/.test(c);

/**
 * Turns letter mistakes into marked-out words. The typist usually notices a
 * letter or two after the slip, so the wrong word is cut off there.
 * Returns the strikeouts and the fixes that still apply letter by letter
 * (none: a marked-out word is retyped clean).
 */
export function strikeoutsFor(text: string, fixes: Map<number, Fix>, seed: number, mark: string): Strikeout[] {
  const out = new Map<number, Strikeout>();
  for (const f of [...fixes.values()].sort((a, b) => a.index - b.index)) {
    let s = f.index;
    while (isWord(text[s - 1])) s--;
    if (out.has(s)) continue;
    let e = f.index + 1;
    while (isWord(text[e])) e++;
    const r = rngFor(seed, 'strikeout', s, f.wrong);
    const noticed = Math.min(e, f.index + 2 + Math.floor(r() * 3));
    out.set(s, { index: s, wrong: text.slice(s, f.index) + f.wrong + text.slice(f.index + 1, noticed), mark });
  }
  return [...out.values()];
}

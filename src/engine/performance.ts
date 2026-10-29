// The performance: the typing script played out in time. Every key, space,
// return, bell, backspace and correction gets a moment and a pressure, so
// the live sound, Play mode and the video export all hear and see the same
// typist. It only reads the layout, the strikes and the settings, so it
// never changes a word you wrote.
//
// Timing is seeded from the typist: a pro types fast and evenly, a first
// timer slowly and unevenly, with longer pauses after sentences and before
// capitals. Pressure comes straight from each strike, so a key that printed
// dark also sounds hard.

import type { Layout, Pos } from './layout';
import type { Strike } from './strikes';
import type { Settings } from './types';
import type { Fix } from './corrections';
import { gauss, rngFor } from './rng';

export type Sound =
  | 'key'
  | 'space'
  | 'tab'
  | 'shift'
  | 'backspace'
  | 'return'
  | 'linefeed'
  | 'bell'
  | 'feed'
  | 'brush'
  | 'slip';

export interface Beat {
  /** seconds from the start */
  t: number;
  sound: Sound;
  /** 0..1, how hard */
  pressure: number;
  /** the character struck */
  ch?: string;
  /** the cell this strike prints (layout.cells index) */
  cell?: number;
  /** an x-out or strikethrough mark landing over this cell */
  over?: number;
  /** the correction at this source index is finished */
  fix?: number;
  /** seconds the sound lasts (carriage travel, a brush stroke) */
  dur?: number;
  /** columns travelled by a carriage return */
  cols?: number;
}

export interface Performance {
  beats: Beat[];
  /** seconds, including a short rest at the end */
  duration: number;
}

export interface PerformanceInput {
  layout: Layout;
  strikes: Strike[];
  /** letter-level corrections by source index */
  fixes: Map<number, Fix>;
  settings: Settings;
}

const SENTENCE_END = /[.!?]/;
const SOFT_PAUSE = /[,;:]/;

/** Plays the typing script out in time. */
export function perform({ layout, strikes, fixes, settings }: PerformanceInput): Performance {
  const r = rngFor(settings.seed, 'tempo');
  const T = Math.max(0, Math.min(1, settings.flaws.typist));
  const machine = settings.look.machine;
  const electric = machine === 'selectric' || machine === 'electronic';
  // seconds between keys for an even stretch of typing
  const base = 0.085 + 0.24 * T ** 0.8;
  const unevenness = 0.18 + 0.4 * T;
  const pressureOf = new Map<number, number>();
  for (const s of strikes) pressureOf.set(s.cell, electric ? 0.6 : Math.max(0, Math.min(1, (s.strength - 0.35) / 1.25)));

  const beats: Beat[] = [];
  let t = 0.35;
  const add = (b: Omit<Beat, 't'>, after = 0) => {
    t += after;
    beats.push({ t, ...b });
  };
  const gap = (scale = 1) => base * scale * Math.exp(gauss(r) * unevenness);

  const cells = layout.cells;
  const fixAt = new Map<number, Fix>();
  for (const c of cells) {
    const f = fixes.get(c.index);
    if (f && c.index >= 0) fixAt.set(c.index, f);
  }
  const style = settings.corrections.style;
  const rush = settings.corrections.rush ?? 0;

  let prev: { page: number; row: number; col: number } = { page: 0, row: 0, col: layout.leftCol };
  // a mistake waiting to be noticed: its cell, and how many more letters go down first
  let pending: { cell: number; fix: Fix; left: number; typedSince: number } | null = null;
  // x-out marks waiting for the end of the wrong word
  let outWord: number[] = [];

  const flushOut = () => {
    if (!outWord.length) return;
    t += gap(2.5); // the pause of noticing
    for (let k = 0; k < outWord.length; k++) add({ sound: 'backspace', pressure: 0.5 }, gap(0.7));
    for (const c of outWord) add({ sound: 'key', ch: cells[c].over, over: c, pressure: Math.min(1, (pressureOf.get(c) ?? 0.5) + 0.2) }, gap(0.55));
    outWord = [];
  };

  const correct = () => {
    if (!pending) return;
    const { cell, fix, typedSince } = pending;
    pending = null;
    t += 0.35 + 0.6 * r() * (0.5 + T);
    for (let k = 0; k <= typedSince; k++) add({ sound: 'backspace', pressure: 0.5 }, gap(0.8));
    if (style === 'whiteout') {
      add({ sound: 'brush', pressure: 0.4, dur: 0.6 + 0.3 * r() }, 0.4);
      t += 0.6 + 0.4 + 1.6 * (1 - rush);
    } else if (style === 'correction-paper' || style === 'tape') {
      add({ sound: 'slip', pressure: 0.4, dur: 0.4 }, 0.3);
      add({ sound: 'key', ch: fix.wrong, pressure: pressureOf.get(cell) ?? 0.5 }, 0.6);
      add({ sound: 'slip', pressure: 0.3, dur: 0.35 }, 0.3);
      add({ sound: 'backspace', pressure: 0.5 }, 0.5);
    } else if (style === 'liftoff') {
      add({ sound: 'key', ch: fix.wrong, pressure: 0.6 }, 0.4);
      add({ sound: 'backspace', pressure: 0.5 }, gap(1));
    }
    add({ sound: 'key', ch: cells[cell].ch, cell, fix: cells[cell].index, pressure: pressureOf.get(cell) ?? 0.5 }, gap(1.2) + 0.15);
    // space forward over the letters that were already right
    for (let k = 0; k < typedSince; k++) add({ sound: 'space', pressure: 0.25 }, gap(0.6));
  };

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];

    // between the last strike and this one: spaces, tabs, returns, new pages
    if (c.page !== prev.page || c.row !== prev.row) {
      if (pending) correct();
      flushOut();
      const lines = c.page !== prev.page ? 1 : c.row - prev.row;
      const travel = Math.max(0, prev.col - layout.leftCol);
      const dur = electric ? 0.22 : 0.18 + travel * 0.006;
      add({ sound: 'return', pressure: 0.5 + 0.3 * r(), dur, cols: travel }, gap(1.5) + 0.1);
      t += dur;
      for (let k = 1; k < lines; k++) add({ sound: 'linefeed', pressure: 0.45 }, 0.25 + 0.15 * r());
      if (c.page !== prev.page) {
        add({ sound: 'feed', pressure: 0.5, dur: 1.4 }, 0.6);
        t += 1.6;
      }
      t += 0.2 + 0.4 * T * r();
      prev = { page: c.page, row: c.row, col: layout.leftCol };
    }
    const gapCols = c.col - prev.col;
    if (gapCols > 0) {
      const last = cells[i - 1];
      const wordEnded = !!last && last.page === c.page && last.row === c.row;
      if (pending && wordEnded) correct();
      if (outWord.length && wordEnded) flushOut();
      if (last && SENTENCE_END.test(last.ch) && wordEnded) t += 0.25 + (0.4 + 0.5 * T) * r();
      else if (last && SOFT_PAUSE.test(last.ch)) t += 0.08 + 0.2 * r();
      if (gapCols > 3) add({ sound: 'tab', pressure: 0.5 }, gap(1.2));
      else for (let k = 0; k < gapCols; k++) add({ sound: 'space', pressure: 0.45 + 0.1 * r() }, gap(0.9));
    }
    // now and then the typist stops to think
    if (r() < 0.012 + 0.02 * T) t += 0.5 + 1.2 * r();

    const isCap = c.ch !== c.ch.toLowerCase();
    if (isCap && !electric) add({ sound: 'shift', pressure: 0.4 }, gap(0.6) + 0.06 * T);
    const pressure = pressureOf.get(i) ?? 0.5;
    add({ sound: 'key', ch: c.ch, cell: i, pressure }, gap(isCap ? 1.3 : 1));
    // the margin bell rings as the carriage passes its stop
    if (c.col === layout.bellCol) beats.push({ t: t + 0.012, sound: 'bell', pressure: 0.6 });

    if (c.over) outWord.push(i);
    if (pending) {
      pending.typedSince++;
      if (pending.typedSince >= pending.left) correct();
    }
    const f = fixAt.get(c.index);
    if (f && cells[i].index >= 0) {
      // how many more letters of the word go down before the typist notices
      let rest = 0;
      while (cells[i + rest + 1] && cells[i + rest + 1].row === c.row && cells[i + rest + 1].col === c.col + rest + 1) rest++;
      const left = Math.min(rest, Math.floor(r() * 3));
      pending = { cell: i, fix: f, left, typedSince: 0 };
      if (left === 0) correct();
    }
    prev = { page: c.page, row: c.row, col: c.col + 1 };
  }
  if (pending) correct();
  flushOut();
  beats.sort((a, b) => a.t - b.t);
  return { beats, duration: t + 1 };
}

/** What has reached the paper at time t. */
export interface Reveal {
  /** cells with an index below this have been struck */
  upTo: number;
  /** cells whose x-out mark hasn't landed yet */
  unover: Set<number>;
  /** source indexes whose correction hasn't happened yet */
  unfixed: Set<number>;
  /** where the printing point is */
  caret: Pos;
}

export function revealAt(perf: Performance, t: number, layout: Layout, fixes: Map<number, Fix>): Reveal {
  let upTo = 0;
  const overDone = new Set<number>();
  const fixDone = new Set<number>();
  // follow the carriage, so the sheet moves the way it did
  let caret: Pos = { page: 0, row: layout.cells[0]?.row ?? 0, col: layout.leftCol };
  for (const b of perf.beats) {
    if (b.t > t) break;
    if (b.cell !== undefined) upTo = Math.max(upTo, b.cell + 1);
    if (b.over !== undefined) overDone.add(b.over);
    if (b.fix !== undefined) fixDone.add(b.fix);
    const at = b.cell ?? b.over;
    if (at !== undefined) {
      const c = layout.cells[at];
      caret = { page: c.page, row: c.row, col: c.col + 1 };
    } else if (b.sound === 'space') caret = { ...caret, col: caret.col + 1 };
    else if (b.sound === 'backspace') caret = { ...caret, col: Math.max(layout.leftCol, caret.col - 1) };
    else if (b.sound === 'return' || b.sound === 'linefeed') caret = { ...caret, row: caret.row + 1, col: layout.leftCol };
    else if (b.sound === 'feed') caret = { page: caret.page + 1, row: 0, col: layout.leftCol };
  }
  // a tab or a skipped blank line lands wherever the next letter goes
  const next = layout.cells[upTo];
  if (next && (next.page !== caret.page || next.row < caret.row)) caret = { page: next.page, row: next.row, col: layout.leftCol };
  const unover = new Set<number>();
  layout.cells.forEach((c, i) => c.over && !overDone.has(i) && unover.add(i));
  const unfixed = new Set<number>();
  for (const k of fixes.keys()) if (!fixDone.has(k)) unfixed.add(k);
  return { upTo, unover, unfixed, caret };
}

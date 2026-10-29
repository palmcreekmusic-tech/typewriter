import { describe, expect, it } from 'vitest';
import { layoutText } from '../src/engine/layout';
import { defaultSettings, SAMPLE_LETTER } from '../src/engine/document';
import { strikesFor } from '../src/engine/strikes';
import { perform, revealAt } from '../src/engine/performance';
import { autoFixes, allFixes } from '../src/engine/corrections';
import { strikeoutsFor } from '../src/engine/timeline';
import type { Settings } from '../src/engine/types';

function play(s: Settings, text = SAMPLE_LETTER, withFixes = false) {
  const layout = layoutText(text, 'letter', s.layout);
  const fixes = withFixes ? allFixes(autoFixes(layout, s.seed, 0.4), [], text) : new Map();
  return { layout, fixes, perf: perform({ layout, strikes: strikesFor(layout, s), fixes, settings: s }) };
}

describe('the performance', () => {
  const s = defaultSettings();

  it('is the same for the same seed', () => {
    expect(play(s).perf).toEqual(play(s).perf);
  });

  it('strikes every letter once, in order, with a return per new line', () => {
    const { layout, perf } = play(s);
    const keys = perf.beats.filter((b) => b.cell !== undefined);
    expect(keys.map((b) => b.cell)).toEqual(layout.cells.map((_, i) => i));
    const rows = new Set(layout.cells.map((c) => c.row)).size;
    expect(perf.beats.filter((b) => b.sound === 'return').length).toBe(rows - 1);
    for (let i = 1; i < perf.beats.length; i++) expect(perf.beats[i].t).toBeGreaterThanOrEqual(perf.beats[i - 1].t);
  });

  it('a first timer takes longer than a pro', () => {
    const pro = play({ ...s, flaws: { ...s.flaws, typist: 0 } }).perf.duration;
    const novice = play({ ...s, flaws: { ...s.flaws, typist: 1 } }).perf.duration;
    expect(novice).toBeGreaterThan(pro * 1.8);
  });

  it('rings the bell near the margin on a long line', () => {
    const long = 'word '.repeat(40);
    const { perf } = play(s, long);
    expect(perf.beats.some((b) => b.sound === 'bell')).toBe(true);
  });

  it('a hard strike sounds hard', () => {
    const { layout, perf } = play({ ...s, flaws: { ...s.flaws, typist: 1 } });
    const strikes = strikesFor(layout, { ...s, flaws: { ...s.flaws, typist: 1 } });
    const keys = perf.beats.filter((b) => b.cell !== undefined);
    const hardest = strikes.reduce((a, b) => (b.strength > a.strength ? b : a));
    const softest = strikes.reduce((a, b) => (b.strength < a.strength ? b : a));
    const p = (cell: number) => keys.find((k) => k.cell === cell)!.pressure;
    expect(p(hardest.cell)).toBeGreaterThan(p(softest.cell));
  });

  it('shows the wrong letter until the correction, and everything by the end', () => {
    const { layout, fixes, perf } = play(s, SAMPLE_LETTER, true);
    expect(fixes.size).toBeGreaterThan(0);
    const first = [...fixes.keys()].sort((a, b) => a - b)[0];
    const cell = layout.cells.findIndex((c) => c.index === first);
    const struck = perf.beats.find((b) => b.cell === cell)!.t;
    const mid = revealAt(perf, struck + 0.001, layout, fixes);
    expect(mid.upTo).toBeGreaterThan(cell);
    expect(mid.unfixed.has(first)).toBe(true);
    const end = revealAt(perf, perf.duration, layout, fixes);
    expect(end.upTo).toBe(layout.cells.length);
    expect(end.unfixed.size).toBe(0);
  });

  it('types the x-out marks after the wrong word', () => {
    const text = 'the quick brown fox';
    const fx = allFixes([{ index: 5, wrong: 'w' }], [], text);
    const outs = strikeoutsFor(text, fx, 3, 'x');
    const layout = layoutText(text, 'letter', s.layout, outs);
    const perf = perform({ layout, strikes: strikesFor(layout, s), fixes: new Map(), settings: s });
    const marked = layout.cells.map((c, i) => (c.over ? i : -1)).filter((i) => i >= 0);
    expect(marked.length).toBeGreaterThan(0);
    const overs = perf.beats.filter((b) => b.over !== undefined).map((b) => b.over);
    expect(overs).toEqual(marked);
    const lastWrong = perf.beats.find((b) => b.cell === marked[marked.length - 1])!.t;
    expect(perf.beats.find((b) => b.over === marked[0])!.t).toBeGreaterThan(lastWrong);
  });
});

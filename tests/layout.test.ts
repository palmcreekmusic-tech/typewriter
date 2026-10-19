import { describe, it, expect } from 'vitest';
import { layoutText } from '../src/engine/layout';
import { defaultSettings } from '../src/engine/document';
import { rngFor, hash } from '../src/engine/rng';

const s = defaultSettings();

describe('layout', () => {
  it('places characters on a pica grid inside the margins', () => {
    const l = layoutText('Hello', 'letter', s.layout);
    expect(l.cellW).toBeCloseTo(0.1);
    expect(l.cells.map((c) => c.col)).toEqual([12, 13, 14, 15, 16]);
    expect(l.caret).toHaveLength(6);
  });

  it('wraps whole words at the right margin', () => {
    const long = Array(40).fill('word').join(' ');
    const l = layoutText(long, 'letter', s.layout);
    for (const c of l.cells) expect(c.col).toBeLessThan(l.rightCol);
    // no word is split across lines
    const byIndex = new Map(l.cells.map((c) => [c.index, c]));
    for (let i = 0; i < long.length; i += 5) {
      const a = byIndex.get(i)!;
      const d = byIndex.get(i + 3)!;
      expect(a.row).toBe(d.row);
    }
  });

  it('handles returns and tabs', () => {
    const l = layoutText('a\n\tb', 'letter', s.layout);
    const b = l.cells.find((c) => c.ch === 'b')!;
    expect(b.row).toBe(1);
    expect(b.col).toBe(l.leftCol + 5);
  });

  it('breaks pages when the sheet is full', () => {
    const l = layoutText(Array(80).fill('line').join('\n'), 'letter', s.layout);
    expect(l.pages.length).toBe(2);
    expect(l.cells.at(-1)!.page).toBe(1);
  });

  it('sizes a caption strip to its text', () => {
    const l = layoutText('Short one', 'caption', s.layout);
    expect(l.pages[0].width).toBeCloseTo(9 * 0.1 + 0.9);
    const two = layoutText('one\ntwo', 'caption', s.layout);
    expect(two.pages[0].height).toBeGreaterThan(l.pages[0].height);
  });
});

describe('seeded randomness', () => {
  it('is repeatable and stream-separated', () => {
    expect(rngFor(5, 'a')()).toBe(rngFor(5, 'a')());
    expect(rngFor(5, 'a')()).not.toBe(rngFor(5, 'b')());
    expect(hash('ab', 'c')).not.toBe(hash('a', 'bc'));
  });
});

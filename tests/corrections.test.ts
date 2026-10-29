import { describe, it, expect } from 'vitest';
import { trackEdit, emptyMemory, autoFixes, slip } from '../src/engine/corrections';
import { layoutText } from '../src/engine/layout';
import { defaultSettings, SAMPLE_LETTER } from '../src/engine/document';
import { rngFor } from '../src/engine/rng';

/** Replays typing: each step is the text after one keystroke. */
function replay(steps: string[]) {
  let mem = emptyMemory();
  let prev = '';
  for (const s of steps) {
    mem = trackEdit(mem, prev, s);
    prev = s;
  }
  return mem;
}

describe('backspace corrections', () => {
  it('turns a deleted and retyped letter into a correction', () => {
    const mem = replay(['w', 'we', 'wes', 'wesy', 'wes', 'west']);
    expect(mem.fixes).toEqual([{ index: 3, wrong: 'y' }]);
  });

  it('handles several letters backspaced and retyped', () => {
    const mem = replay(['1', '19', '196', '1963', '196', '19', '1', '19', '196', '1962']);
    // only the 3 that became a 2 changed; retyping the same 9 and 6 isn't a correction
    expect(mem.fixes).toEqual([{ index: 3, wrong: '3' }]);
  });

  it('moves corrections along when text is added before them', () => {
    let mem = replay(['ab', 'a', 'ax']);
    expect(mem.fixes).toEqual([{ index: 1, wrong: 'b' }]);
    mem = trackEdit(mem, 'ax', 'Hi ax');
    expect(mem.fixes).toEqual([{ index: 4, wrong: 'b' }]);
  });

  it('drops a correction when its letter is deleted for good', () => {
    let mem = replay(['ab', 'a', 'ax']);
    mem = trackEdit(mem, 'ax', 'a');
    mem = trackEdit(mem, 'a', 'a!');
    // retyping after deleting the corrected x corrects the x, not the b
    expect(mem.fixes).toEqual([{ index: 1, wrong: 'x' }]);
  });

  it('a selected letter typed over counts too', () => {
    expect(trackEdit(emptyMemory(), 'cat', 'cut').fixes).toEqual([{ index: 1, wrong: 'a' }]);
  });
});

describe('random typos', () => {
  const s = defaultSettings();
  const layout = layoutText(SAMPLE_LETTER, 'letter', s.layout);

  it('slips to a neighbouring key, keeping the case', () => {
    const r = rngFor(1, 't');
    for (let i = 0; i < 20; i++) expect('ghjkl;nm'.includes(slip('j', r)!) || 'yuihknm'.includes(slip('j', r)!)).toBe(true);
    expect(slip('A', r)).toMatch(/[A-Z]/);
  });

  it('happens more at higher rates and stays put as you type', () => {
    expect(autoFixes(layout, 3, 0)).toEqual([]);
    const many = autoFixes(layout, 3, 1);
    expect(many.length).toBeGreaterThan(autoFixes(layout, 3, 0.3).length);
    const longer = layoutText(SAMPLE_LETTER + ' More words typed at the end.', 'letter', s.layout);
    const after = autoFixes(longer, 3, 1).filter((f) => f.index < SAMPLE_LETTER.length);
    expect(after).toEqual(many);
  });
});

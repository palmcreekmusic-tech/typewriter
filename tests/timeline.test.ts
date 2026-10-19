import { describe, it, expect } from 'vitest';
import { typingScript, strikeoutsFor } from '../src/engine/timeline';
import { layoutText } from '../src/engine/layout';
import { defaultSettings } from '../src/engine/document';

describe('typing timeline', () => {
  const text = 'the quick fox';

  it('puts the marked-out word before the right one', () => {
    const t = typingScript(text, [{ index: 4, wrong: 'quo', mark: 'x' }]);
    expect(t.text).toBe('the quo quick fox');
    expect(t.over.slice(4, 7)).toEqual(['x', 'x', 'x']);
    expect(t.src.slice(4, 8)).toEqual([-1, -1, -1, -1]);
    expect(t.src[8]).toBe(4);
    expect(t.pos[4]).toBe(8);
    expect(t.pos[text.length]).toBe(t.text.length);
  });

  it('turns letter slips into word strikeouts cut off soon after the slip', () => {
    const outs = strikeoutsFor(text, new Map([[6, { index: 6, wrong: 'o' }]]), 1, 'x');
    expect(outs).toHaveLength(1);
    expect(outs[0].index).toBe(4);
    expect(outs[0].wrong.startsWith('quo')).toBe(true);
    expect(outs[0].wrong.length).toBeLessThanOrEqual(5);
  });

  it('keeps the caret on the clean text', () => {
    const s = defaultSettings();
    const outs = [{ index: 4, wrong: 'quo', mark: 'x' }];
    const l = layoutText(text, 'caption', s.layout, outs);
    expect(l.caret).toHaveLength(text.length + 1);
    // the q of "quick" now sits four columns later
    expect(l.caret[4].col).toBe(layoutText(text, 'caption', s.layout).caret[4].col + 4);
    expect(l.cells.filter((c) => c.over === 'x')).toHaveLength(3);
  });
});

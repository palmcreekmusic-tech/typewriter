import { describe, expect, it } from 'vitest';
import { layoutText, LINES_PER_INCH } from '../src/engine/layout';
import { defaultSettings } from '../src/engine/document';
import { SURFACES } from '../src/surfaces/surfaces';
import type { Surface } from '../src/engine/types';

const lay = (surface: Surface, text: string, captionWidth = 44) => layoutText(text, 'caption', { ...defaultSettings().layout, surface, captionWidth });

describe('printed surfaces', () => {
  it('a strip is still sized to the text', () => {
    const l = lay('strip', 'hello');
    expect(l.surface).toBeUndefined();
    expect(l.pages[0].width).toBeLessThan(3);
  });

  it('each card is its own size and types inside its printed area', () => {
    for (const id of ['index', 'telegram', 'label', 'postcard'] as const) {
      const def = SURFACES[id];
      const l = lay(id, 'x'.repeat(200), 80);
      expect(l.surface).toBe(id);
      expect(l.pages).toEqual([{ width: def.w, height: def.h }]);
      expect(l.originX).toBe(def.area.x);
      const right = Math.max(...l.cells.map((c) => l.originX + (c.col + 1) * l.cellW));
      expect(right).toBeLessThanOrEqual(def.area.x + def.area.w + 1e-9);
    }
  });

  it('an index card types every line on its quarter-inch rules', () => {
    const l = lay('index', 'a\nb\nc');
    expect(l.cellH).toBeCloseTo(1.5 / LINES_PER_INCH);
    expect(l.cellH).toBeCloseTo(0.25);
  });

  it('a telegram is capitals only, one for one', () => {
    const text = 'arriving tuesday stop';
    const l = lay('telegram', text);
    expect(l.cells.map((c) => c.ch).join('')).toBe('ARRIVINGTUESDAYSTOP');
    expect(l.caret).toHaveLength(text.length + 1);
  });
});

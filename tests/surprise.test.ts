import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/engine/document';
import { perfectOf, surpriseLook } from '../src/engine/surprise';
import { resolveFlaws } from '../src/engine/flaws';

describe('surprise and perfect', () => {
  it('deals the same look for the same seed, and a different one for another', () => {
    const s = defaultSettings();
    expect(surpriseLook(s, 5)).toEqual(surpriseLook(s, 5));
    expect(JSON.stringify(surpriseLook(s, 5).look)).not.toEqual(JSON.stringify(surpriseLook(s, 6).look));
  });

  it('keeps every flaw in range', () => {
    for (let i = 0; i < 50; i++) {
      const s = surpriseLook(defaultSettings(), i);
      for (const v of Object.values(resolveFlaws(s.flaws, s.look.machine))) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('perfect zeroes the typing flaws but keeps the paper', () => {
    const s = surpriseLook(defaultSettings(), 3);
    const before = resolveFlaws(s.flaws, s.look.machine);
    const p = resolveFlaws(perfectOf(s).flaws, s.look.machine);
    expect(p.baseline).toBe(0);
    expect(p.typos).toBe(0);
    expect(p.grain).toBeCloseTo(before.grain);
    expect(perfectOf(s).quirks).toEqual([]);
  });
});

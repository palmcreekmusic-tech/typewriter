import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/engine/document';
import { FLAWS, resolveFlaws, sliderOf } from '../src/engine/flaws';

describe('typist and machine sliders', () => {
  const s = defaultSettings();
  const at = (typist: number, machine: number) => resolveFlaws({ ...s.flaws, typist, machine }, 'underwood');

  it('the Typist slider moves only typist flaws', () => {
    const a = at(0, 0.5);
    const b = at(1, 0.5);
    for (const f of FLAWS) {
      if (sliderOf(f) === 'typist') expect(b[f.key]).toBeGreaterThan(a[f.key]);
      else expect(b[f.key]).toBe(a[f.key]);
    }
  });

  it('the Machine slider moves the machine, ribbon and grain, never the typist', () => {
    const a = at(0.5, 0);
    const b = at(0.5, 1);
    for (const f of FLAWS) if (sliderOf(f) === 'typist') expect(b[f.key]).toBe(a[f.key]);
    expect(b.misalign).toBeGreaterThan(a.misalign);
    expect(b.fade).toBeGreaterThan(a.fade);
  });
});

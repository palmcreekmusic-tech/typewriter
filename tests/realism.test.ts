import { describe, it, expect } from 'vitest';
import { layoutText } from '../src/engine/layout';
import { defaultSettings, SAMPLE_LETTER } from '../src/engine/document';
import { both, effectiveFlaws, resolveFlaws, cantDo } from '../src/engine/flaws';
import { computeStrikes } from '../src/engine/strikes';

describe('realistic mode', () => {
  const s = defaultSettings();
  const flaws = { ...s.flaws, ...both(1) };

  it('keeps every flaw under its ceiling, and artistic lifts it', () => {
    const real = effectiveFlaws(flaws, 'underwood');
    const art = effectiveFlaws(flaws, 'underwood', true);
    expect(real.double).toBeLessThan(art.double);
    expect(art).toEqual(resolveFlaws(flaws, 'underwood'));
  });

  it("drops what the machine can't do", () => {
    const ball = effectiveFlaws(flaws, 'selectric');
    expect(ball.misalign).toBe(0);
    expect(ball.caps).toBe(0);
    expect(ball.pressure).toBe(0);
    expect(cantDo('misalign', 'selectric')).toBeTruthy();
    expect(cantDo('misalign', 'underwood')).toBeUndefined();
    expect(effectiveFlaws(flaws, 'selectric', true).misalign).toBeGreaterThan(0);
  });

  it('a letter is off the same way every time it appears', () => {
    const layout = layoutText(SAMPLE_LETTER, 'letter', s.layout);
    const amounts = { ...effectiveFlaws(flaws, 'underwood'), baseline: 0, spacing: 0 };
    const st = computeStrikes({ layout, amounts, seed: 9, variants: 9, machine: 'underwood', ribbon: 'fabric', fontSpread: 0 });
    const dxOf = (ch: string) => st.filter((x) => layout.cells[x.cell].ch === ch).map((x) => x.dx);
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const within = spread(dxOf('e'));
    const between = spread(['e', 't', 'a', 'o', 'n', 'r', 's', 'h'].map((c) => dxOf(c)[0]));
    expect(within).toBeLessThan(between);
  });
});

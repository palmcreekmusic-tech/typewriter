import { describe, it, expect } from 'vitest';
import { layoutText } from '../src/engine/layout';
import { defaultSettings, SAMPLE_LETTER } from '../src/engine/document';
import { both, resolveFlaws } from '../src/engine/flaws';
import { computeStrikes } from '../src/engine/strikes';
import type { Quirk } from '../src/engine/quirks';

function strikes(master: number, seed = 7) {
  const s = defaultSettings();
  const layout = layoutText(SAMPLE_LETTER, 'letter', s.layout);
  const amounts = resolveFlaws({ ...s.flaws, ...both(master) }, s.look.machine);
  return computeStrikes({ layout, amounts, seed, variants: 9, machine: s.look.machine, ribbon: s.look.ribbon, fontSpread: 0 });
}

describe('strikes', () => {
  it('is repeatable for a seed', () => {
    expect(strikes(0.6)).toEqual(strikes(0.6));
    expect(strikes(0.6, 8)).not.toEqual(strikes(0.6));
  });

  it('gets messier toward first timer', () => {
    const pro = strikes(0);
    const rookie = strikes(1);
    const count = (xs: ReturnType<typeof strikes>, f: (s: (typeof xs)[0]) => boolean) => xs.filter(f).length;
    expect(count(pro, (s) => !!s.double)).toBe(0);
    expect(count(rookie, (s) => !!s.double)).toBeGreaterThan(5);
    expect(count(rookie, (s) => s.blots.length > 0)).toBeGreaterThan(10);
    expect(count(rookie, (s) => s.fill > 0)).toBeGreaterThan(count(pro, (s) => s.fill > 0));
    const spread = (xs: typeof pro) => Math.max(...xs.map((s) => Math.abs(s.dy)));
    expect(spread(rookie)).toBeGreaterThan(spread(pro) * 3);
  });

  it('never moves letters already typed when you type more', () => {
    const s = defaultSettings();
    const amounts = resolveFlaws({ ...s.flaws, ...both(1) }, s.look.machine);
    const run = (text: string) =>
      computeStrikes({ layout: layoutText(text, 'letter', s.layout), amounts, seed: 4, variants: 9, machine: s.look.machine, ribbon: s.look.ribbon, fontSpread: 0, twoTone: true });
    const short = run(SAMPLE_LETTER.slice(0, 200));
    const long = run(SAMPLE_LETTER);
    expect(long.slice(0, short.length)).toEqual(short);
  });

  it('spacing slips move letters sideways, and the second colour creeps in', () => {
    const s = defaultSettings();
    const layout = layoutText(SAMPLE_LETTER, 'letter', s.layout);
    const run = (spacing: number, twotone: number) =>
      computeStrikes({ layout, amounts: { ...resolveFlaws({ ...s.flaws, ...both(0) }, s.look.machine), spacing, twotone }, seed: 2, variants: 9, machine: s.look.machine, ribbon: s.look.ribbon, fontSpread: 0, twoTone: true });
    const far = (xs: ReturnType<typeof run>) => Math.max(...xs.map((x) => Math.abs(x.dx)));
    expect(far(run(1, 0))).toBeGreaterThan(far(run(0, 0)) * 4);
    expect(run(0, 0).some((x) => x.creep)).toBe(false);
    expect(run(0, 1).filter((x) => x.creep).length).toBeGreaterThan(50);
  });
});

describe('key quirks', () => {
  const s = defaultSettings();
  const layout = layoutText(SAMPLE_LETTER, 'letter', s.layout);
  const amounts = resolveFlaws({ ...s.flaws, ...both(0.3) }, s.look.machine);
  const run = (quirks: Quirk[]) =>
    computeStrikes({ layout, amounts, seed: 3, variants: 9, machine: s.look.machine, ribbon: s.look.ribbon, fontSpread: 0, quirks });
  const of = (xs: ReturnType<typeof run>, ch: string) => xs.filter((x) => layout.cells[x.cell].ch === ch);
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

  it('marks only the damaged key, the same way every time', () => {
    const clean = run([]);
    const worn = run([{ ch: 'e', kind: 'faint', amount: 1 }, { ch: 't', kind: 'high', amount: 1 }, { ch: 'r', kind: 'chipped', amount: 1 }]);
    expect(mean(of(worn, 'e').map((x) => x.alpha))).toBeLessThan(mean(of(clean, 'e').map((x) => x.alpha)) * 0.6);
    expect(mean(of(worn, 't').map((x) => x.dy))).toBeLessThan(mean(of(clean, 't').map((x) => x.dy)) - 0.01);
    expect(of(worn, 'r').every((x) => !!x.chip)).toBe(true);
    const chips = new Set(of(worn, 'r').map((x) => JSON.stringify(x.chip)));
    expect(chips.size).toBe(1);
    expect(of(worn, 'a')).toEqual(of(clean, 'a'));
  });
});

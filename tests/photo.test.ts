import { describe, expect, it } from 'vitest';
import { layoutText } from '../src/engine/layout';
import { defaultSettings } from '../src/engine/document';
import { captionCols, defaultPhoto, placeOnPrint, planPrint, printBase, type PhotoSettings } from '../src/photo/plan';
import { frameDistances, frameGeometry, type Border } from '../src/photo/frame';
import { frameSeed } from '../src/photo/roll';

const BORDERS: Border[] = ['none', 'thin', 'full', 'filed', 'filedwhite', 'print', 'printclean'];

function place(ps: PhotoSettings, text = 'The long way home. Kodak Gold, frame 14.', aspect = 1.5, seed = 7) {
  const s = defaultSettings();
  const base = printBase(aspect, ps, seed);
  const cols = captionCols(base, ps, 1 / s.layout.pitch);
  const l = layoutText(text, 'photo', { ...s.layout, captionWidth: Math.min(s.layout.captionWidth, cols) });
  const plan = planPrint(base, ps, seed, l);
  return { base, cols, plan, layout: placeOnPrint(l, plan) };
}

describe('photo mode', () => {
  it('makes the same frame from the same seed, and a different one from another', () => {
    const a = frameGeometry('print', 6, 4, 11);
    const b = frameGeometry('print', 6, 4, 11);
    const c = frameGeometry('print', 6, 4, 12);
    expect(a.gi).toEqual(b.gi);
    expect(a.theta).toBe(b.theta);
    expect(a.gi).not.toEqual(c.gi);
  });

  it('a machined frame is square and even', () => {
    const g = frameGeometry('full', 6, 4, 3, 0);
    expect(Math.abs(g.theta)).toBe(0);
    expect(new Set(g.gi.map((v) => v.toFixed(6))).size).toBe(1);
  });

  it('the photo fills the whole opening and the border barely crops it', () => {
    for (const border of BORDERS.filter((b) => b !== 'none'))
      for (const vary of [0, 1, 2])
        for (const seed of [1, 2, 3, 4, 5]) {
          const { base } = place({ ...defaultPhoto(), border, vary }, 'x', 1.5, seed);
          const g = base.geom!;
          const im = base.image;
          // every point of the frame that shows picture has photo under it
          for (let i = 0; i <= 200; i++)
            for (const [x, y] of [
              [(i / 200) * base.frame.w, 0],
              [(i / 200) * base.frame.w, base.frame.h],
              [0, (i / 200) * base.frame.h],
              [base.frame.w, (i / 200) * base.frame.h],
            ]) {
              // walk in from the edge to the gate
              const cx = base.frame.w / 2;
              const cy = base.frame.h / 2;
              let t = 0;
              while (t < 1 && frameDistances(g, x + (cx - x) * t, y + (cy - y) * t).dGate < 0) t += 0.002;
              const px = base.frame.x + x + (cx - x) * t;
              const py = base.frame.y + y + (cy - y) * t;
              expect(px).toBeGreaterThanOrEqual(im.x - 1e-6);
              expect(px).toBeLessThanOrEqual(im.x + im.w + 1e-6);
              expect(py).toBeGreaterThanOrEqual(im.y - 1e-6);
              expect(py).toBeLessThanOrEqual(im.y + im.h + 1e-6);
            }
          // and very little of the photo is hidden under the black
          expect((base.visible.w * base.visible.h) / (im.w * im.h)).toBeGreaterThan(0.9);
        }
  });

  it('keeps every caption on the print, wherever it goes', () => {
    const long = 'A much longer caption that will have to wrap over several lines on a small print, because the typist kept going.';
    for (const placement of ['margin', 'photo', 'strip'] as const)
      for (const border of BORDERS)
        for (const aspect of [1.5, 0.75, 1]) {
          const { layout, plan } = place({ ...defaultPhoto(), border, placement, size: 4 }, long, aspect);
          expect(layout.mode).toBe('photo');
          expect(layout.print).toBe(plan);
          for (const c of layout.cells) {
            const x = layout.originX + (c.col + 1) * layout.cellW;
            const y = layout.originY + (c.row + 1) * layout.cellH;
            expect(x).toBeLessThanOrEqual(plan.width + 1e-9);
            expect(y).toBeLessThanOrEqual(plan.height + 1e-9);
          }
        }
  });

  it('the margin grows to fit the caption under the photo', () => {
    const one = place({ ...defaultPhoto(), placement: 'margin' }, 'One line.');
    const three = place({ ...defaultPhoto(), placement: 'margin' }, 'One line.\nTwo lines.\nThree lines.');
    expect(three.plan.height).toBeGreaterThan(one.plan.height);
    expect(one.plan.origin.y).toBeGreaterThan(one.base.visible.y + one.base.visible.h);
  });

  it('a strip is glued across the foot of the photo, a little crooked', () => {
    const { plan } = place({ ...defaultPhoto(), placement: 'strip' });
    expect(plan.strip).toBeDefined();
    const v = plan.visible;
    expect(plan.strip!.y).toBeLessThan(v.y + v.h);
    expect(plan.strip!.y + plan.strip!.h).toBeGreaterThan(v.y + v.h * 0.6);
    expect(Math.abs(plan.strip!.angle)).toBeLessThan(0.03);
  });
});

describe('rolls', () => {
  it('the first frame keeps the roll seed; the others get their own, the same every time', () => {
    expect(frameSeed(1962, 0)).toBe(1962);
    const seeds = Array.from({ length: 36 }, (_, i) => frameSeed(1962, i));
    expect(new Set(seeds).size).toBe(36);
    expect(seeds).toEqual(Array.from({ length: 36 }, (_, i) => frameSeed(1962, i)));
    for (const s of seeds) expect(s).toBeGreaterThanOrEqual(1);
  });

  it('frames of one roll get different prints from the same settings', () => {
    const ps = defaultPhoto();
    const a = printBase(1.5, ps, frameSeed(7, 1)).geom!;
    const b = printBase(1.5, ps, frameSeed(7, 2)).geom!;
    expect(a.gi).not.toEqual(b.gi);
  });
});

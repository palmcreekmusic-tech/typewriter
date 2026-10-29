// Photo mode: where the print, its border and the typing go. Everything here
// is in inches and comes from the seed, like the page itself, so the same
// photo, caption and seed always make the same print.
//
// The caption can go on the print's bottom margin (a darkroom note), straight
// on the photo, or on a strip of typing paper glued across its foot.

import type { Layout } from '../engine/layout';
import { CAPTION_PAD } from '../engine/layout';
import { rngFor } from '../engine/rng';
import { frameGeometry, framePad, type Border, type FrameGeom } from './frame';

export type Placement = 'margin' | 'photo' | 'strip';

export interface PhotoSettings {
  border: Border;
  placement: Placement;
  /** how hand-made the frame looks: 0 machined, 1 typical, 2 sloppy */
  vary: number;
  /** the photo's long side, in inches */
  size: number;
}

/** a glued-on strip is trimmed closer to the type than a caption card */
const STRIP_PAD = { x: 0.3, y: 0.17 };

export const defaultPhoto = (): PhotoSettings => ({ border: 'print', placement: 'margin', vary: 1, size: 6 });

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PrintBase {
  border: Border;
  /** the area the frame geometry covers */
  frame: Rect;
  /** where the photo is drawn */
  image: Rect;
  /** the part of the photo the black doesn't cover */
  visible: Rect;
  geom: FrameGeom | null;
  /** plain paper around the frame (a black-bordered photo printed with a margin) */
  around: number;
}

export interface PrintPlan extends PrintBase {
  width: number;
  height: number;
  /** caption origin, as for a page: column 0, row 0 */
  origin: { x: number; y: number };
  /** a strip of typing paper glued on, for the 'strip' placement */
  strip?: Rect & { angle: number };
}

/** The print without the caption: photo size, paper and border. */
export function printBase(aspect: number, ps: PhotoSettings, seed: number): PrintBase {
  const a = Math.max(0.2, Math.min(5, aspect || 1.5));
  const imgW = a >= 1 ? ps.size : ps.size * a;
  const imgH = a >= 1 ? ps.size / a : ps.size;
  const pad = framePad(ps.border, imgW, imgH, seed, ps.vary);
  const fw = imgW + 2 * pad;
  const fh = imgH + 2 * pad;
  const geom = ps.border === 'none' ? null : frameGeometry(ps.border, fw, fh, seed, ps.vary);
  // a caption on the margin needs paper; a black-framed scan gets printed with some
  const around = ps.placement === 'margin' && !geom?.white ? 0.3 : 0;
  const frame = { x: around, y: around, w: fw, h: fh };
  const gi = geom?.gi ?? [0, 0, 0, 0];
  const visible = { x: frame.x + gi[0], y: frame.y + gi[2], w: fw - gi[0] - gi[1], h: fh - gi[2] - gi[3] };
  // the photo fills the opening, crooked gate and all, with a hair to spare
  // so no paper ever shows between picture and black
  const cx = visible.x + visible.w / 2 + (geom?.ox ?? 0);
  const cy = visible.y + visible.h / 2 + (geom?.oy ?? 0);
  const spare = geom ? 0.012 + (Math.abs(geom.theta) * Math.max(fw, fh)) / 2 : 0;
  const k = Math.max((visible.w + 2 * spare) / imgW, (visible.h + 2 * spare) / imgH);
  const image = { x: cx - (imgW * k) / 2, y: cy - (imgH * k) / 2, w: imgW * k, h: imgH * k };
  return { border: ps.border, frame, image, visible, geom, around };
}

/** The most columns a caption can have on this print. */
export function captionCols(base: PrintBase, ps: PhotoSettings, cellW: number) {
  const w = base.frame.w + 2 * base.around;
  const room = ps.placement === 'margin' ? base.visible.w : ps.placement === 'photo' ? base.visible.w - 0.6 : w - 0.5 - 2 * STRIP_PAD.x;
  return Math.max(6, Math.floor(room / cellW));
}

/** The whole print, sized and arranged around a caption laid out in caption mode. */
export function planPrint(base: PrintBase, ps: PhotoSettings, seed: number, caption: Layout): PrintPlan {
  const rows = Math.max(1, ...caption.caret.map((p) => p.row + 1));
  const used = caption.pages[0].width - 2 * CAPTION_PAD.x;
  const width = base.frame.w + 2 * base.around;
  let height = base.frame.h + 2 * base.around;
  const v = base.visible;
  const r = rngFor(seed, 'print-caption');
  if (ps.placement === 'margin') {
    // typed under the picture, lined up with its left edge
    const top = v.y + v.h + 0.2;
    height = Math.max(height, top + rows * caption.cellH + 0.32);
    return { ...base, width, height, origin: { x: v.x, y: top } };
  }
  if (ps.placement === 'photo') {
    const y = Math.max(v.y + 0.2, v.y + v.h - 0.28 - rows * caption.cellH);
    return { ...base, width, height, origin: { x: v.x + 0.3, y } };
  }
  // a strip of typing paper, glued on a little crooked across the foot of the photo
  const w = used + 2 * STRIP_PAD.x;
  const h = rows * caption.cellH + 2 * STRIP_PAD.y;
  const slack = Math.max(0, width - w - 0.3);
  const x = Math.max(0.15, (width - w) / 2 + (r() - 0.5) * slack * 0.5);
  const y = Math.max(0.1, Math.min(v.y + v.h - h * (0.45 + 0.25 * r()), height - h - 0.08));
  const angle = (r() - 0.5) * 0.026 * Math.min(2, ps.vary + 0.3);
  return { ...base, width, height, strip: { x, y, w, h, angle }, origin: { x: x + STRIP_PAD.x, y: y + STRIP_PAD.y } };
}

/** The caption's layout moved onto the print. */
export function placeOnPrint(caption: Layout, plan: PrintPlan): Layout {
  return {
    ...caption,
    mode: 'photo',
    originX: plan.origin.x,
    originY: plan.origin.y,
    pages: [{ width: plan.width, height: plan.height }],
    print: plan,
  };
}

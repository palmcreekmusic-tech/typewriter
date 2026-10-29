// Printed stationery to type a caption on: an index card, a telegram form,
// a gummed label and the back of a postcard. Each is a fixed size with its
// own printed rules and headings, and a place the typist would line the
// carriage up to. The printing is offset litho, so it sits a hair off
// square and off register, the same way every time for a seed.
//
// The text keeps to the sheet's own size: type past the bottom and it runs
// off the card, the way it would.

import type { PaperKind, Surface } from '../engine/types';
import { rngFor, type Rng } from '../engine/rng';
import type { Ctx2D } from '../render/canvas';

export type { Surface };

export interface SurfaceDef {
  id: Surface;
  name: string;
  /** inches */
  w: number;
  h: number;
  /** where column 0, row 0 goes, and how wide the typing area is */
  area: { x: number; y: number; w: number };
  /** the stock it's printed on, and how warm */
  paper: PaperKind;
  tone: number;
  /** telegraph text has no lower case */
  upper?: boolean;
  /** ruled stationery sets the line spacing: 1.5 lands every line on a quarter-inch rule */
  lineSpacing?: 1 | 1.5 | 2;
  /** the printed furniture, in inches (ctx is scaled to inches) */
  print?: (ctx: Ctx2D, r: Rng) => void;
}

const RED = 'rgba(196, 64, 58, 0.75)';
const BLUE = 'rgba(92, 132, 190, 0.55)';
const BROWN = 'rgba(122, 64, 38, 0.92)';
const GREY = 'rgba(70, 66, 60, 0.85)';

function line(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function text(ctx: Ctx2D, s: string, x: number, y: number, size: number, color: string, opts: { align?: CanvasTextAlign; spacing?: number; weight?: number; family?: string } = {}) {
  // ctx is in inches; type is set at 100 units an inch so no font is ever under a pixel
  const K = 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / K, 1 / K);
  ctx.fillStyle = color;
  ctx.font = `${opts.weight ?? 600} ${size * K}px ${opts.family ?? "Georgia, 'Times New Roman', serif"}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // letterspaced headings, laid out by hand so every canvas agrees
  const sp = (opts.spacing ?? 0) * K;
  const chars = [...s];
  const widths = chars.map((c) => ctx.measureText(c).width + sp);
  const total = widths.reduce((a, b) => a + b, 0) - sp;
  let cx = opts.align === 'center' ? -total / 2 : opts.align === 'right' ? -total : 0;
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, 0);
    cx += widths[i];
  });
  ctx.restore();
}

export const SURFACES: Record<Surface, SurfaceDef> = {
  strip: { id: 'strip', name: 'Paper strip', w: 0, h: 0, area: { x: 0, y: 0, w: 0 }, paper: 'bond', tone: 0.2 },

  // 5 × 3 ruled card: a red head line, blue lines a quarter inch apart
  index: {
    id: 'index',
    name: 'Index card',
    w: 5,
    h: 3,
    area: { x: 0.32, y: 0.4, w: 4.4 },
    paper: 'bond',
    tone: 0.1,
    lineSpacing: 1.5,
    print(ctx) {
      // the heading sits on the red line, every line after on a blue one
      line(ctx, 0, 0.55, 5, 0.55, RED, 0.012);
      line(ctx, 0, 0.575, 5, 0.575, RED, 0.006);
      for (let y = 0.8; y < 2.95; y += 0.25) line(ctx, 0, y, 5, y, BLUE, 0.007);
    },
  },

  // a telegram form: letterspaced heading, two rules, the clerk's boxes
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    w: 7,
    h: 4.6,
    area: { x: 0.55, y: 1.55, w: 5.9 },
    paper: 'cream',
    tone: 0.8,
    upper: true,
    print(ctx) {
      text(ctx, 'TELEGRAM', 3.5, 0.62, 0.34, BROWN, { align: 'center', spacing: 0.09, weight: 700 });
      line(ctx, 0.4, 0.8, 6.6, 0.8, BROWN, 0.02);
      line(ctx, 0.4, 0.84, 6.6, 0.84, BROWN, 0.006);
      const boxes = ['NO.', 'CL. OF SVC.', 'PD. OR COLL.', 'CASH NO.', 'CHARGE TO', 'TIME FILED'];
      const bw = 6.2 / boxes.length;
      boxes.forEach((b, i) => {
        const x = 0.4 + i * bw;
        ctx.strokeStyle = BROWN;
        ctx.lineWidth = 0.006;
        ctx.strokeRect(x, 0.95, bw, 0.38);
        text(ctx, b, x + 0.05, 1.04, 0.065, BROWN, { weight: 600, spacing: 0.006 });
      });
      text(ctx, 'Send the following message, subject to the terms on back hereof, which are hereby agreed to', 3.5, 1.46, 0.07, BROWN, { align: 'center', weight: 400 });
      line(ctx, 0.4, 4.2, 6.6, 4.2, BROWN, 0.006);
      text(ctx, 'SENDER’S ADDRESS', 0.45, 4.33, 0.065, BROWN, { spacing: 0.006 });
    },
  },

  // a small gummed label with a printed double border and clipped corners
  label: {
    id: 'label',
    name: 'Gummed label',
    w: 4,
    h: 2.2,
    area: { x: 0.45, y: 0.6, w: 3.1 },
    paper: 'cream',
    tone: 0.45,
    print(ctx) {
      const frame = (inset: number, cut: number, width: number) => {
        const [x0, y0, x1, y1] = [inset, inset, 4 - inset, 2.2 - inset];
        ctx.strokeStyle = GREY;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x0 + cut, y0);
        ctx.lineTo(x1 - cut, y0);
        ctx.lineTo(x1, y0 + cut);
        ctx.lineTo(x1, y1 - cut);
        ctx.lineTo(x1 - cut, y1);
        ctx.lineTo(x0 + cut, y1);
        ctx.lineTo(x0, y1 - cut);
        ctx.lineTo(x0, y0 + cut);
        ctx.closePath();
        ctx.stroke();
      };
      frame(0.14, 0.16, 0.016);
      frame(0.2, 0.13, 0.006);
    },
  },

  // the back of a postcard: heading, a divider, a stamp box and address lines
  postcard: {
    id: 'postcard',
    name: 'Postcard',
    w: 5.5,
    h: 3.5,
    area: { x: 0.3, y: 0.78, w: 2.25 },
    paper: 'cream',
    tone: 0.3,
    print(ctx) {
      text(ctx, 'POST CARD', 2.75, 0.42, 0.2, GREY, { align: 'center', spacing: 0.05, weight: 700 });
      line(ctx, 2.75, 0.65, 2.75, 3.2, GREY, 0.01);
      ctx.strokeStyle = GREY;
      ctx.lineWidth = 0.008;
      ctx.setLineDash([0.04, 0.03]);
      ctx.strokeRect(4.45, 0.3, 0.78, 0.92);
      ctx.setLineDash([]);
      text(ctx, 'PLACE', 4.84, 0.68, 0.06, GREY, { align: 'center', weight: 600 });
      text(ctx, 'STAMP', 4.84, 0.78, 0.06, GREY, { align: 'center', weight: 600 });
      text(ctx, 'HERE', 4.84, 0.88, 0.06, GREY, { align: 'center', weight: 600 });
      for (const y of [1.75, 2.2, 2.65, 3.1]) line(ctx, 3.0, y, 5.2, y, GREY, 0.006);
      text(ctx, 'ADDRESS ONLY ON THIS SIDE', 4.1, 1.42, 0.055, GREY, { align: 'center', spacing: 0.01, weight: 400 });
    },
  },
};

export const surfaceOf = (id: Surface | undefined) => SURFACES[id ?? 'strip'] ?? SURFACES.strip;

/** Telegraph type: capitals only, one for one so the caret still lines up. */
export function upper(ch: string) {
  const u = ch.toUpperCase();
  return u.length === 1 ? u : ch;
}

/** Prints the stationery onto a sheet already drawn at ppi, a little off square. */
export function printSurface(ctx: Ctx2D, id: Surface, ppi: number, seed: number) {
  const def = SURFACES[id];
  if (!def?.print) return;
  const r = rngFor(seed, 'surface-print');
  ctx.save();
  ctx.scale(ppi, ppi);
  // the plate never lands quite square on the sheet
  ctx.translate((r() - 0.5) * 0.04, (r() - 0.5) * 0.03);
  ctx.translate(def.w / 2, def.h / 2);
  ctx.rotate((r() - 0.5) * 0.004);
  ctx.translate(-def.w / 2, -def.h / 2);
  ctx.globalCompositeOperation = 'multiply';
  def.print(ctx, r);
  ctx.restore();
}

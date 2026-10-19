// Draws one page: paper, then the ink layer multiplied on top.
// The same function serves the live screen and (later) every export, so
// what you see is exactly what you get.

import type { Layout, Cell } from '../engine/layout';
import { LINES_PER_INCH } from '../engine/layout';
import type { Settings } from '../engine/types';
import { fontById, advanceRatio, type FontDef } from '../engine/fonts';
import { rngFor, hash } from '../engine/rng';
import { makeCanvas, ctx2d, type AnyCanvas, type Ctx2D } from './canvas';
import { paperTexture } from './paper';
import { speckleTile } from './noise';

export interface RenderOptions {
  layout: Layout;
  settings: Settings;
  page: number;
  /** output pixels per inch */
  ppi: number;
  /** false = ink only on transparent */
  withPaper?: boolean;
}

/** Where the baseline sits inside the first 1/6 inch of each line box. */
const BASELINE = 0.78 / LINES_PER_INCH;

export function renderPage(target: Ctx2D, o: RenderOptions) {
  const { layout, settings, page, ppi } = o;
  const pg = layout.pages[page] ?? layout.pages[0];
  const w = Math.round(pg.width * ppi);
  const h = Math.round(pg.height * ppi);

  target.save();
  target.clearRect(0, 0, w, h);
  if (o.withPaper !== false) {
    target.drawImage(paperTexture(settings.look.paper, settings.look.paperTone, pg.width, pg.height, ppi, settings.seed) as CanvasImageSource, 0, 0);
  }
  const ink = renderInk(o, w, h);
  target.globalCompositeOperation = o.withPaper !== false ? 'multiply' : 'source-over';
  target.drawImage(ink as CanvasImageSource, 0, 0);
  target.restore();
}

/** Stable per-character key: the nth time this letter appears in the text. */
function glyphKeys(cells: Cell[]) {
  const seen = new Map<string, number>();
  return cells.map((c) => {
    const n = seen.get(c.ch) ?? 0;
    seen.set(c.ch, n + 1);
    return `${c.ch}#${n}`;
  });
}

function renderInk(o: RenderOptions, w: number, h: number): AnyCanvas {
  const { layout, settings, page, ppi } = o;
  const look = settings.look;
  const font = fontById(look.fontId);
  const ink = makeCanvas(w, h);
  const ctx = ctx2d(ink);

  const sizeIn = typeSize(font, layout.cellW, ctx);
  const sizePx = sizeIn * ppi;
  const adv = advanceRatio(font, ctx) * sizeIn;
  const keys = glyphKeys(layout.cells);

  ctx.fillStyle = look.inkColor;
  ctx.strokeStyle = look.inkColor;
  ctx.lineJoin = 'round';
  ctx.lineWidth = font.spread * ppi;
  ctx.textBaseline = 'alphabetic';

  // A trace of humanity even at "perfect": tiny density and position
  // differences per strike. Milestone 2's flaw layer builds on top of this.
  for (let i = 0; i < layout.cells.length; i++) {
    const c = layout.cells[i];
    if (c.page !== page) continue;
    const r = rngFor(settings.seed, 'strike', keys[i]);
    const variant = Math.floor(r() * font.families.length);
    const x = (layout.originX + c.col * layout.cellW + (layout.cellW - adv) / 2) * ppi;
    const y = (layout.originY + c.row * layout.cellH + BASELINE) * ppi;
    const jx = (r() - 0.5) * 0.003 * ppi;
    const jy = (r() - 0.5) * 0.003 * ppi;
    ctx.globalAlpha = look.ribbon === 'film' ? 0.97 + r() * 0.03 : 0.86 + r() * 0.14;
    ctx.font = `${sizePx}px "${font.families[variant]}"`;
    ctx.fillText(c.ch, x + jx, y + jy);
    if (font.spread > 0) ctx.strokeText(c.ch, x + jx, y + jy);
  }
  ctx.globalAlpha = 1;

  applyRibbonTexture(ctx, w, h, ppi, settings.seed, look.ribbon);
  return ink;
}

/** Type size in inches: Pica-sized type fills its cell; nothing grows past 12 pt. */
export function typeSize(font: FontDef, cellW: number, ctx: Ctx2D) {
  const fit = cellW / advanceRatio(font, ctx);
  return Math.min(fit, (12 / 72) * (cellW / 0.1)) * font.scale;
}

/**
 * Fabric ribbons print through a weave: ink breaks up into fine speckle.
 * Carbon copies are softer. Film prints solid.
 */
function applyRibbonTexture(ctx: Ctx2D, w: number, h: number, ppi: number, seed: number, ribbon: Settings['look']['ribbon']) {
  if (ribbon === 'film') return;
  const tilePx = 192;
  const tile = speckleTile(tilePx, rngFor(seed, 'ribbon', ribbon), ribbon === 'carbon' ? 0.22 : 0.16, ribbon === 'carbon' ? 0.8 : 0.35);
  const pat = ctx.createPattern(tile as CanvasImageSource, 'repeat');
  if (!pat) return;
  // weave size is physical (~1/300 inch per speck) at any output size
  const k = Math.max(0.5, ppi / 300);
  pat.setTransform?.(new DOMMatrix().scale(k, k).translate(hash(seed) % tilePx, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = ribbon === 'carbon' ? 0.55 : 0.4;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

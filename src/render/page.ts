// Draws one page: paper, then the ink layer multiplied on top.
// The same function serves the live screen and every export, so what you
// see is exactly what you get.

import type { Layout } from '../engine/layout';
import { LINES_PER_INCH } from '../engine/layout';
import type { Settings } from '../engine/types';
import { fontById, advanceRatio, type FontDef } from '../engine/fonts';
import { resolveFlaws, type FlawAmounts } from '../engine/flaws';
import { computeStrikes, pageFlaws, type Strike } from '../engine/strikes';
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
export const BASELINE = 0.78 / LINES_PER_INCH;

export function renderPage(target: Ctx2D, o: RenderOptions) {
  const { layout, settings, page, ppi } = o;
  const pg = layout.pages[page] ?? layout.pages[0];
  const w = Math.round(pg.width * ppi);
  const h = Math.round(pg.height * ppi);
  const amounts = resolveFlaws(settings.flaws, settings.look.machine);

  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, w, h);
  if (o.withPaper !== false) {
    target.drawImage(
      paperTexture(settings.look.paper, settings.look.paperTone, pg.width, pg.height, ppi, settings.seed, amounts.grain) as CanvasImageSource,
      0,
      0,
    );
  }
  const ink = renderInk(o, w, h, amounts);
  if (!ink) {
    target.restore();
    return;
  }
  const { tilt } = pageFlaws(settings.seed, page, amounts);
  target.globalCompositeOperation = o.withPaper !== false ? 'multiply' : 'source-over';
  if (tilt) {
    // The sheet went in crooked: the type runs at an angle to the paper edge.
    target.translate(w / 2, h / 2);
    target.rotate(tilt);
    target.translate(-w / 2, -h / 2);
  }
  target.drawImage(ink.canvas as CanvasImageSource, ink.x, ink.y);
  target.restore();
}

/** Type size in inches: Pica-sized type fills its cell; nothing grows past 12 pt. */
export function typeSize(font: FontDef, cellW: number, ctx: Ctx2D) {
  const fit = cellW / advanceRatio(font, ctx);
  return Math.min(fit, (12 / 72) * (cellW / 0.1)) * font.scale;
}

let scratch: AnyCanvas | null = null;
function getScratch(w: number, h: number) {
  if (!scratch || scratch.width < w || scratch.height < h) scratch = makeCanvas(Math.max(w, scratch?.width ?? 0), Math.max(h, scratch?.height ?? 0));
  return scratch;
}

/**
 * Draws the ink for one page into a canvas that covers only the typed area
 * (plus room for doubles, splatter and bleed), so a short caption or a half
 * typed letter costs little to redraw on every key.
 */
function renderInk(o: RenderOptions, pageW: number, pageH: number, a: FlawAmounts): { canvas: AnyCanvas; x: number; y: number } | null {
  const { layout, settings, page, ppi } = o;
  const look = settings.look;
  const font = fontById(look.fontId);

  let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (const c of layout.cells) {
    if (c.page !== page || !c.ch.trim()) continue;
    if (c.row < r0) r0 = c.row;
    if (c.row > r1) r1 = c.row;
    if (c.col < c0) c0 = c.col;
    if (c.col > c1) c1 = c.col;
  }
  if (r0 === Infinity) return null;
  const pad = 0.3;
  const x = Math.max(0, Math.floor((layout.originX + c0 * layout.cellW - pad) * ppi));
  const y = Math.max(0, Math.floor((layout.originY + r0 * layout.cellH - pad) * ppi));
  const w = Math.min(pageW, Math.ceil((layout.originX + (c1 + 1) * layout.cellW + pad) * ppi)) - x;
  const h = Math.min(pageH, Math.ceil((layout.originY + (r1 + 1) * layout.cellH + pad) * ppi)) - y;
  if (w <= 0 || h <= 0) return null;

  const ink = makeCanvas(w, h);
  const ctx = ctx2d(ink);
  ctx.translate(-x, -y);

  const sizeIn = typeSize(font, layout.cellW, ctx);
  const sizePx = sizeIn * ppi;

  const strikes = computeStrikes({
    layout,
    amounts: a,
    seed: settings.seed,
    variants: font.families.length,
    machine: look.machine,
    ribbon: look.ribbon,
    fontSpread: font.spread,
  });

  ctx.fillStyle = look.inkColor;
  ctx.strokeStyle = look.inkColor;
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';

  for (const s of strikes) {
    const c = layout.cells[s.cell];
    if (c.page !== page) continue;
    // glyph center on the baseline, in px
    const cx = (layout.originX + c.col * layout.cellW + layout.cellW / 2) * ppi;
    const by = (layout.originY + c.row * layout.cellH + BASELINE) * ppi;
    const fontCss = `${sizePx}px "${font.families[s.variant]}"`;

    if (s.double) drawGlyph(ctx, c.ch, fontCss, cx + (s.dx + s.double.dx) * ppi, by + (s.dy + s.double.dy) * ppi, s.rot, s.double.alpha, s.spread * ppi * 0.6, s, sizePx, look.inkColor, true);
    drawGlyph(ctx, c.ch, fontCss, cx + s.dx * ppi, by + s.dy * ppi, s.rot, s.alpha, s.spread * ppi, s, sizePx, look.inkColor, false);

    for (const b of s.blots) {
      const x = cx + (s.dx + b.x) * ppi;
      const y = by + (s.dy + b.y) * ppi;
      const rad = Math.max(0.6, b.r * ppi);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, look.inkColor);
      g.addColorStop(0.72, look.inkColor);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = Math.min(1, b.a * (0.35 + 0.75 * s.alpha));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = look.inkColor;
    }
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  applyBleed(ctx, ink, w, h, ppi, settings.seed, a.bleed, look.ribbon, x, y);
  // the weave pattern stays put on the page as the typed area grows
  applyRibbonTexture(ctx, w, h, ppi, settings.seed, look.ribbon, a, x, y);
  return { canvas: ink, x, y };
}

/**
 * One key strike. Plain strikes go straight onto the ink layer; strikes with
 * a density gradient or clogged counters are composed on a scratch canvas first.
 */
function drawGlyph(
  ctx: Ctx2D,
  ch: string,
  fontCss: string,
  x: number,
  y: number,
  rot: number,
  alpha: number,
  spreadPx: number,
  s: Strike,
  sizePx: number,
  inkColor: string,
  ghost: boolean,
) {
  const needsScratch = !ghost && (s.fill > 0.01 || Math.abs(s.top - 1) > 0.03 || Math.abs(s.bottom - 1) > 0.03);
  if (!needsScratch) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = fontCss;
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.fillText(ch, 0, 0);
    if (spreadPx > 0.15) {
      ctx.lineWidth = spreadPx;
      ctx.strokeText(ch, 0, 0);
    }
    ctx.restore();
    return;
  }

  // Scratch box: two em wide and tall, baseline at 70%.
  const box = Math.ceil(sizePx * 2);
  const sc = getScratch(box, box);
  const sx = ctx2d(sc);
  const ox = box / 2;
  const oy = box * 0.7;
  sx.save();
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.clearRect(0, 0, box, box);
  sx.font = fontCss;
  sx.textAlign = 'center';
  sx.textBaseline = 'alphabetic';
  sx.fillStyle = inkColor;
  sx.strokeStyle = inkColor;
  sx.lineJoin = 'round';
  sx.fillText(ch, ox, oy);
  if (spreadPx > 0.15) {
    sx.lineWidth = spreadPx;
    sx.strokeText(ch, ox, oy);
  }

  if (s.fill > 0.01) {
    // Clogged slug: ink packs the bowls. A heavy stroke of the same glyph,
    // kept only inside the bowl region, closes the counters from the edges in.
    const isUpper = ch !== ch.toLowerCase() || /[0-9&@%]/.test(ch);
    const bowlY = oy - sizePx * (isUpper ? 0.36 : 0.24);
    const fill = makeCanvas(box, box);
    const fx = ctx2d(fill);
    fx.font = fontCss;
    fx.textAlign = 'center';
    fx.textBaseline = 'alphabetic';
    fx.strokeStyle = inkColor;
    fx.fillStyle = inkColor;
    fx.lineJoin = 'round';
    fx.lineWidth = sizePx * (0.1 + 0.2 * s.fill);
    fx.strokeText(ch, ox, oy);
    fx.globalCompositeOperation = 'destination-in';
    const g = fx.createRadialGradient(ox, bowlY, 0, ox, bowlY, sizePx * (isUpper ? 0.4 : 0.3));
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.6, `rgba(0,0,0,${0.6 + 0.4 * s.fill})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    fx.fillStyle = g;
    fx.fillRect(0, 0, box, box);
    sx.globalAlpha = 0.95;
    sx.drawImage(fill as CanvasImageSource, 0, 0);
    sx.globalAlpha = 1;
  }

  if (Math.abs(s.top - 1) > 0.03 || Math.abs(s.bottom - 1) > 0.03) {
    // Lighten the top or bottom of the letter.
    sx.globalCompositeOperation = 'destination-out';
    const top = oy - sizePx * 0.75;
    const g = sx.createLinearGradient(0, top, 0, oy + sizePx * 0.05);
    g.addColorStop(0, `rgba(0,0,0,${Math.min(1, Math.max(0, 1 - s.top))})`);
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${Math.min(1, Math.max(0, 1 - s.bottom))})`);
    sx.fillStyle = g;
    sx.fillRect(0, 0, box, box);
  }
  sx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(sc as CanvasImageSource, 0, 0, box, box, -ox, -oy, box, box);
  ctx.restore();
}

/** Fabric ink wicks into the paper fibers: a soft, uneven halo under the strokes. */
function applyBleed(ctx: Ctx2D, ink: AnyCanvas, w: number, h: number, ppi: number, seed: number, bleed: number, ribbon: Settings['look']['ribbon'], ox = 0, oy = 0) {
  const amount = ribbon === 'film' ? bleed * 0.25 : ribbon === 'carbon' ? Math.min(1, bleed + 0.35) : bleed;
  if (amount < 0.02) return;
  const halo = makeCanvas(w, h);
  const hx = ctx2d(halo);
  hx.filter = `blur(${Math.max(0.4, (0.0012 + 0.0035 * amount) * ppi)}px)`;
  hx.drawImage(ink as CanvasImageSource, 0, 0);
  hx.filter = 'none';
  // break the halo up along the fibers so it feathers rather than glows
  const tile = speckleTile(160, rngFor(seed, 'bleed'), 0.45, 0.6);
  const pat = hx.createPattern(tile as CanvasImageSource, 'repeat');
  if (pat) {
    pat.setTransform?.(new DOMMatrix().translate(-ox, -oy).scale(Math.max(0.5, ppi / 260)));
    hx.globalCompositeOperation = 'destination-out';
    hx.globalAlpha = 0.7;
    hx.fillStyle = pat;
    hx.fillRect(0, 0, w, h);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.globalAlpha = 0.2 + 0.45 * amount;
  ctx.drawImage(halo as CanvasImageSource, 0, 0);
  ctx.restore();
}

/**
 * Fabric ribbons print through a weave: ink breaks up into fine speckle,
 * more so as the ribbon dries and on toothy paper. Film prints solid.
 */
function applyRibbonTexture(ctx: Ctx2D, w: number, h: number, ppi: number, seed: number, ribbon: Settings['look']['ribbon'], a: FlawAmounts, ox = 0, oy = 0) {
  const dry = 1 - a.ink;
  if (ribbon === 'film' && dry < 0.6) return;
  const tilePx = 192;
  const density = ribbon === 'film' ? 0.05 : (ribbon === 'carbon' ? 0.22 : 0.12) + 0.22 * dry * dry + 0.05 * a.grain;
  const tile = speckleTile(tilePx, rngFor(seed, 'ribbon', ribbon), Math.min(0.6, density), ribbon === 'carbon' ? 0.8 : 0.35);
  const pat = ctx.createPattern(tile as CanvasImageSource, 'repeat');
  if (!pat) return;
  // weave size is physical (~1/300 inch per speck) at any output size
  const k = Math.max(0.5, ppi / 300);
  pat.setTransform?.(new DOMMatrix().translate(-ox, -oy).scale(k, k).translate(hash(seed) % tilePx, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = Math.min(0.9, (ribbon === 'carbon' ? 0.55 : 0.35) + 0.45 * dry);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

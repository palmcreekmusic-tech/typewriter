// Draws one page: paper, then the ink layer multiplied on top.
// The same function serves the live screen and every export, so what you
// see is exactly what you get.

import type { Layout } from '../engine/layout';
import { LINES_PER_INCH } from '../engine/layout';
import type { Settings } from '../engine/types';
import { fontById, advanceRatio, type FontDef } from '../engine/fonts';
import { effectiveFlaws, type FlawAmounts } from '../engine/flaws';
import { strikesFor, pageFlaws, type Strike } from '../engine/strikes';
import { rngFor, hash } from '../engine/rng';
import { makeCanvas, ctx2d, release, drawBlurred, type AnyCanvas, type Ctx2D } from './canvas';
import { paperTexture, drawFolds, paperInk } from './paper';
import { speckleTile } from './noise';
import type { Reveal } from '../engine/performance';
import type { Fix } from '../engine/corrections';
import { drawPatch, retypeStrike, drawSmudge, breakOnBumps } from './corrections';

export interface RenderOptions {
  layout: Layout;
  settings: Settings;
  page: number;
  /** output pixels per inch */
  ppi: number;
  /** false = ink only on transparent */
  withPaper?: boolean;
  /** corrected characters by source index */
  fixes?: Map<number, Fix>;
  /** Play mode: only what has been typed so far */
  reveal?: Reveal;
  /** Photo mode: the print stands in for the paper */
  print?: { canvas: AnyCanvas; strip?: { x: number; y: number; w: number; h: number; angle: number } };
}

/** Where the baseline sits inside the first 1/6 inch of each line box. */
export const BASELINE = 0.78 / LINES_PER_INCH;

export function renderPage(target: Ctx2D, o: RenderOptions) {
  const { layout, settings, page, ppi } = o;
  const pg = layout.pages[page] ?? layout.pages[0];
  const w = Math.round(pg.width * ppi);
  const h = Math.round(pg.height * ppi);
  const amounts = effectiveFlaws(settings.flaws, settings.look.machine, settings.artistic);

  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, w, h);
  const strip = o.print?.strip;
  if (o.withPaper !== false) {
    if (o.print) target.drawImage(o.print.canvas as CanvasImageSource, 0, 0);
    else
      target.drawImage(
        paperTexture(settings.look.paper, settings.look.paperTone, pg.width, pg.height, ppi, settings.seed, amounts.grain, amounts.stains) as CanvasImageSource,
        0,
        0,
      );
  }
  if (strip) {
    // a strip of typing paper glued on a little crooked; the type turns with it
    const cx = (strip.x + strip.w / 2) * ppi;
    const cy = (strip.y + strip.h / 2) * ppi;
    target.translate(cx, cy);
    target.rotate(strip.angle);
    target.translate(-cx, -cy);
    if (o.withPaper !== false) {
      target.save();
      target.shadowColor = 'rgba(30, 24, 16, 0.32)';
      target.shadowBlur = 0.03 * ppi;
      target.shadowOffsetY = 0.012 * ppi;
      target.drawImage(
        paperTexture(settings.look.paper, settings.look.paperTone, strip.w, strip.h, ppi, settings.seed, amounts.grain, amounts.stains) as CanvasImageSource,
        Math.round(strip.x * ppi),
        Math.round(strip.y * ppi),
      );
      target.restore();
    }
  }
  const strips = renderInk(o, w, h, amounts);
  const { tilt } = pageFlaws(settings.seed, page, amounts);
  target.globalCompositeOperation = o.withPaper !== false ? 'multiply' : 'source-over';
  if (tilt) {
    // The sheet went in crooked: the type runs at an angle to the paper edge.
    target.translate(w / 2, h / 2);
    target.rotate(tilt);
    target.translate(-w / 2, -h / 2);
  }
  for (const st of strips) target.drawImage(st.canvas as CanvasImageSource, st.x, st.y);
  const blend = target.globalCompositeOperation;
  target.globalCompositeOperation = 'source-over';
  for (const st of strips) if (st.white) target.drawImage(st.white as CanvasImageSource, st.x, st.y);
  target.globalCompositeOperation = blend;
  for (const st of strips) if (st.top) target.drawImage(st.top as CanvasImageSource, st.x, st.y);
  target.restore();
  // creases cross the type too, so they go on last
  if (o.withPaper !== false && !o.print) drawFolds(target as CanvasRenderingContext2D, w, h, ppi, amounts.folds, settings.seed);
}

/** Type size in inches: Pica-sized type fills its cell; nothing grows past 12 pt. */
export function typeSize(font: FontDef, cellW: number, ctx: Ctx2D) {
  const fit = cellW / advanceRatio(font, ctx);
  return Math.min(fit, (12 / 72) * (cellW / 0.1)) * font.scale;
}

// Speckle tiles depend only on their recipe, so each is built once.
const speckles = new Map<string, AnyCanvas>();
function speckle(size: number, seed: number, name: string, density: number, blur: number) {
  const key = [size, seed, name, density.toFixed(3), blur].join('|');
  let t = speckles.get(key);
  if (!t) {
    if (speckles.size > 24) {
      const [k, old] = speckles.entries().next().value!;
      speckles.delete(k);
      release(old);
    }
    speckles.set(key, (t = speckleTile(size, rngFor(seed, ...name.split('/')), density, blur)));
  }
  return t;
}

let scratch: AnyCanvas | null = null;
function getScratch(w: number, h: number) {
  if (!scratch || scratch.width < w || scratch.height < h) scratch = makeCanvas(Math.max(w, scratch?.width ?? 0), Math.max(h, scratch?.height ?? 0));
  return scratch;
}
let fillScratch: AnyCanvas | null = null;
function getFillScratch(w: number, h: number) {
  if (!fillScratch || fillScratch.width < w || fillScratch.height < h) fillScratch = makeCanvas(Math.max(w, fillScratch?.width ?? 0), Math.max(h, fillScratch?.height ?? 0));
  return fillScratch;
}

function releaseStrip(st: Strip) {
  release(st.canvas);
  release(st.white);
  release(st.top);
}

interface Strip {
  canvas: AnyCanvas;
  x: number;
  y: number;
  /** whiteout and friends, drawn normally over the ink */
  white?: AnyCanvas;
  /** letters retyped over a correction */
  top?: AnyCanvas;
}

// Finished rows of ink, so a keystroke only redraws the row it lands on.
// Keys carry everything that changes a row's look; anything else (a new
// typeface, size, ink, seed) changes the "env" part and starts afresh.
const rowCache = new Map<string, Strip>();
let rowCacheEnv = '';

/**
 * Draws the ink for one page as one strip per typed row. Rows whose strikes
 * haven't changed come from the cache.
 */
function renderInk(o: RenderOptions, pageW: number, pageH: number, a: FlawAmounts): Strip[] {
  const { layout, settings, page, ppi } = o;
  const look = settings.look;
  const font = fontById(look.fontId);

  const strikes = strikesFor(layout, settings, a);

  const rows = new Map<number, Strike[]>();
  const upTo = o.reveal?.upTo ?? Infinity;
  for (const st of strikes) {
    const c = layout.cells[st.cell];
    if (c.page !== page || !c.ch.trim() || st.cell >= upTo) continue;
    let list = rows.get(c.row);
    if (!list) rows.set(c.row, (list = []));
    list.push(st);
  }

  // Play mode: a mistake not yet noticed shows as the wrong letter alone
  const allFixes = o.fixes ?? new Map<number, Fix>();
  const unfixed = o.reveal?.unfixed;
  const fixes = unfixed?.size ? new Map([...allFixes].filter(([k]) => !unfixed.has(k))) : allFixes;
  const wrongOnly = unfixed?.size ? new Map([...allFixes].filter(([k]) => unfixed.has(k))) : undefined;
  const unover = o.reveal?.unover;
  const env = [JSON.stringify(settings.corrections), look.fontId, look.inkColor, look.inkColor2, look.ribbon, look.paper, ppi, settings.seed, a.bleed.toFixed(3), a.ink.toFixed(3), a.grain.toFixed(3), layout.cellW, layout.cellH, layout.originX, layout.originY].join('|');
  if (env !== rowCacheEnv) {
    for (const st of rowCache.values()) releaseStrip(st);
    rowCache.clear();
    rowCacheEnv = env;
  }

  const out: Strip[] = [];
  const used = new Set<string>();
  for (const [row, list] of rows) {
    const sig = list.map((st) => {
      const { cell, ...rest } = st;
      const c = layout.cells[cell];
      const over = unover?.has(cell) ? '' : (c.over ?? '');
      return [c.ch, c.col, over, fixes.get(c.index)?.wrong ?? '', wrongOnly?.get(c.index)?.wrong ?? '', JSON.stringify(rest)].join('');
    });
    const key = `${row}|${hash(...sig)}`;
    used.add(key);
    let strip = rowCache.get(key);
    if (!strip) {
      strip = renderRow(o, list, row, pageW, pageH, a, font, fixes, wrongOnly);
      rowCache.set(key, strip);
    }
    out.push(strip);
  }
  // drop rows that no longer exist (edited or deleted text)
  if (rowCache.size > used.size + 40)
    for (const [k, st] of rowCache)
      if (!used.has(k)) {
        rowCache.delete(k);
        releaseStrip(st);
      }
  return out;
}

function renderRow(o: RenderOptions, list: Strike[], row: number, pageW: number, pageH: number, a: FlawAmounts, font: FontDef, fixes: Map<number, Fix>, wrongOnly?: Map<number, Fix>): Strip {
  const { layout, settings, ppi } = o;
  const look = settings.look;
  let c0 = Infinity;
  let c1 = -Infinity;
  let far = 0;
  for (const st of list) {
    const col = layout.cells[st.cell].col;
    if (col < c0) c0 = col;
    if (col > c1) c1 = col;
    far = Math.max(far, Math.abs(st.dx), Math.abs(st.dy));
  }
  // room around the row for doubles, splatter, leaning letters, bleed and spacing slips
  const padX = 0.25 + far;
  const padY = 0.2 + far;
  const x = Math.max(0, Math.floor((layout.originX + c0 * layout.cellW - padX) * ppi));
  const y = Math.max(0, Math.floor((layout.originY + row * layout.cellH - padY) * ppi));
  const w = Math.max(1, Math.min(pageW, Math.ceil((layout.originX + (c1 + 1) * layout.cellW + padX) * ppi)) - x);
  const h = Math.max(1, Math.min(pageH, Math.ceil((layout.originY + (row + 1) * layout.cellH + padY) * ppi)) - y);

  const ink = makeCanvas(w, h);
  const ctx = ctx2d(ink);
  ctx.translate(-x, -y);

  const sizeIn = typeSize(font, layout.cellW, ctx);
  const sizePx = sizeIn * ppi;

  ctx.fillStyle = look.inkColor;
  ctx.strokeStyle = look.inkColor;
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';

  const corrected: { s: Strike; c: Layout['cells'][number]; fontCss: string; cx: number; by: number; wrong: string }[] = [];
  const cells: { s: Strike; c: Layout['cells'][number]; fontCss: string; cx: number; by: number }[] = [];
  for (const s of list) {
    const c = layout.cells[s.cell];
    // glyph center on the baseline, in px
    const cx = (layout.originX + c.col * layout.cellW + layout.cellW / 2) * ppi;
    const by = (layout.originY + c.row * layout.cellH + BASELINE) * ppi;
    const fontCss = `${sizePx}px "${font.families[s.variant]}"`;

    cells.push({ s, c, fontCss, cx, by });
    const fix = fixes.get(c.index);
    const slip = wrongOnly?.get(c.index);
    // a corrected cell first got the wrong letter (gone entirely with lift-off tape)
    const first = fix ? fix.wrong : slip ? slip.wrong : c.ch;
    if (fix) corrected.push({ s, c, fontCss, cx, by, wrong: fix.wrong });
    if (!fix || settings.corrections.style !== 'liftoff') {
      if (s.double) drawGlyph(ctx, first, fontCss, cx + (s.dx + s.double.dx) * ppi, by + (s.dy + s.double.dy) * ppi, s.rot, s.double.alpha, s.spread * ppi * 0.6, s, sizePx, look.inkColor, true);
      drawGlyph(ctx, first, fontCss, cx + s.dx * ppi, by + s.dy * ppi, s.rot, s.alpha, s.spread * ppi, s, sizePx, look.inkColor, false, look.inkColor2);
      if (c.over && !o.reveal?.unover.has(s.cell)) {
        // the x (or dash) of a marked-out word, typed straight over it after a backspace
        // struck hard and on purpose, so it prints darker than the letter under it;
        // a dash is narrower than its cell, so it's stretched to join up into a line
        const r = rngFor(settings.seed, 'over', c.index, c.col, c.row);
        ctx.save();
        ctx.translate(cx + (s.dx + (r() - 0.5) * 0.004) * ppi, by + (s.dy + (r() - 0.5) * 0.004) * ppi);
        if (c.over === '-') ctx.scale(1.9, 1);
        drawGlyph(ctx, c.over, fontCss, 0, 0, s.rot * 0.5, Math.min(1, s.alpha * 1.15 + 0.1), s.spread * ppi + sizePx * 0.03, s, sizePx, look.inkColor, true);
        ctx.restore();
      }
      if (s.trail) {
        // only the leading edge of the ghost reaches the paper
        const gx = cx + (s.dx + s.trail.dx) * ppi;
        const half = (layout.cellW * ppi) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(gx - half, by - sizePx * 1.2, half * 2 * s.trail.part, sizePx * 1.6);
        ctx.clip();
        drawGlyph(ctx, first, fontCss, gx, by + s.dy * ppi, s.rot, s.trail.alpha, s.spread * ppi * 0.5, s, sizePx, look.inkColor, true);
        ctx.restore();
      }
    }

    for (const b of s.blots) {
      const bx = cx + (s.dx + b.x) * ppi;
      const bY = by + (s.dy + b.y) * ppi;
      const rad = Math.max(0.6, b.r * ppi);
      const g = ctx.createRadialGradient(bx, bY, 0, bx, bY, rad);
      g.addColorStop(0, look.inkColor);
      g.addColorStop(0.72, look.inkColor);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = Math.min(1, b.a * (0.35 + 0.75 * s.alpha));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, bY, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = look.inkColor;
    }
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const paper = paperInk(look.paper);
  applyBleed(ctx, ink, w, h, ppi, settings.seed, Math.min(1, a.bleed * paper.absorb + (paper.absorb - 1) * 0.15), look.ribbon, x, y);
  // the weave pattern is fixed to the page, so rows line up seamlessly
  applyRibbonTexture(ctx, w, h, ppi, settings.seed, look.ribbon, a, x, y, paper.tooth);
  if (!corrected.length) return { canvas: ink, x, y };

  // The corrections, then the right letters typed over them.
  const cs = settings.corrections;
  const white = makeCanvas(w, h);
  const wx = ctx2d(white);
  wx.translate(-x, -y);
  const top = makeCanvas(w, h);
  const tx = ctx2d(top);
  tx.translate(-x, -y);
  tx.fillStyle = look.inkColor;
  tx.strokeStyle = look.inkColor;
  tx.lineJoin = 'round';
  tx.textBaseline = 'alphabetic';
  tx.textAlign = 'center';
  const byCol = new Map<number, (typeof cells)[number]>();
  for (const k of cells) byCol.set(k.c.col, k);
  const retyped = new Set<number>();
  for (const k of corrected) {
    const r = rngFor(settings.seed, 'fix', k.c.ch, k.wrong, k.c.index);
    const reach = drawPatch(wx, cs, { ch: k.wrong, fontCss: k.fontCss, x: k.cx + k.s.dx * ppi, y: k.by + k.s.dy * ppi, rot: k.s.rot, sizePx }, layout.cellW * ppi, ppi, r);
    const re = retypeStrike(k.s, cs, r);
    if (cs.style === 'whiteout') drawSmudge(tx, k.cx + re.dx * ppi, k.by + re.dy * ppi, sizePx, cs.rush, look.inkColor, r);
    // the letter itself, then any neighbours the white spilled over, all
    // typed again with the same slip because the paper moved once
    const cw = layout.cellW * ppi;
    const redo = [k.c.col];
    for (let d = 1; d <= 3; d++) {
      if (reach.left > cw * (d - 0.3)) redo.push(k.c.col - d);
      if (reach.right > cw * (d - 0.3)) redo.push(k.c.col + d);
    }
    for (const col of redo) {
      const n = byCol.get(col);
      if (!n || retyped.has(col) || (col !== k.c.col && fixes.has(n.c.index))) continue;
      retyped.add(col);
      const rs = { ...retypeStrike(n.s, cs, () => 0.5), dx: n.s.dx + (re.dx - k.s.dx), dy: n.s.dy + (re.dy - k.s.dy), rot: re.rot };
      drawGlyph(tx, n.c.ch, n.fontCss, n.cx + rs.dx * ppi, n.by + rs.dy * ppi, rs.rot, rs.alpha, rs.spread * ppi, rs, sizePx, look.inkColor, false, look.inkColor2);
    }
  }
  if (cs.style === 'whiteout') breakOnBumps(tx, w, h, cs.mess, x, y);
  return { canvas: ink, x, y, white, top };
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
  inkColor2 = '',
) {
  const creep = inkColor2 && s.creep ? s.creep : 0;
  const sides = Math.abs(s.left - 1) > 0.03 || Math.abs(s.right - 1) > 0.03;
  const needsScratch =
    !ghost && (creep > 0 || s.fill > 0.01 || !!s.chip || sides || !!s.cutBottom || !!s.cutTop || !!s.tailless || Math.abs(s.top - 1) > 0.03 || Math.abs(s.bottom - 1) > 0.03);
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
  const sc = getScratch(box + 2, box + 2);
  const sx = ctx2d(sc);
  const ox = box / 2;
  const oy = box * 0.7;
  sx.save();
  sx.setTransform(1, 0, 0, 1, 0, 0);
  // clear a pixel past the box too: drawing the box rotated samples its
  // edge, and leftovers from a bigger earlier glyph would show as dashes
  sx.clearRect(0, 0, box + 2, box + 2);
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
    const fill = getFillScratch(box + 2, box + 2);
    const fx = ctx2d(fill);
    fx.save();
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.globalCompositeOperation = 'source-over';
    fx.clearRect(0, 0, box + 2, box + 2);
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
    fx.restore();
    sx.globalAlpha = 0.95;
    sx.drawImage(fill as CanvasImageSource, 0, 0, box, box, 0, 0, box, box);
    sx.globalAlpha = 1;
  }

  if (creep > 0) {
    // Two-colour ribbon: the lower band prints the second colour from the
    // bottom of the letter up, with a soft, slightly ragged edge.
    sx.globalCompositeOperation = 'source-atop';
    const foot = oy + sizePx * 0.22;
    const edge = foot - sizePx * 1.05 * creep;
    const g = sx.createLinearGradient(0, edge - sizePx * 0.08, 0, edge + sizePx * 0.08);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, inkColor2);
    sx.fillStyle = g;
    sx.fillRect(0, edge - sizePx * 0.08, box, sizePx * 0.16);
    sx.fillStyle = inkColor2;
    sx.fillRect(0, edge + sizePx * 0.08 - 0.5, box, box);
    sx.globalCompositeOperation = 'source-over';
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
  if (sides) {
    // Off its feet sideways: one side of the slug meets the platen harder.
    sx.globalCompositeOperation = 'destination-out';
    const g = sx.createLinearGradient(ox - sizePx * 0.4, 0, ox + sizePx * 0.4, 0);
    g.addColorStop(0, `rgba(0,0,0,${Math.min(1, Math.max(0, 1 - s.left))})`);
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${Math.min(1, Math.max(0, 1 - s.right))})`);
    sx.fillStyle = g;
    sx.fillRect(0, 0, box, box);
  }
  if (s.cutBottom || s.cutTop || s.tailless) {
    // Hard cut-offs, with a slightly ragged edge where the ribbon ends.
    sx.globalCompositeOperation = 'destination-out';
    sx.fillStyle = 'rgba(0,0,0,1)';
    const foot = oy + sizePx * 0.25;
    const cap = oy - sizePx * 0.78;
    const rag = (y: number, down: boolean) => {
      sx.beginPath();
      sx.moveTo(0, down ? box : 0);
      for (let i = 0; i <= 8; i++) sx.lineTo((box * i) / 8, y + Math.sin(i * 2.3 + y) * sizePx * 0.015);
      sx.lineTo(box, down ? box : 0);
      sx.fill();
    };
    if (s.cutBottom) rag(foot - (foot - cap) * s.cutBottom, true);
    if (s.tailless) rag(oy + sizePx * 0.035, true);
    if (s.cutTop) rag(cap + (foot - cap) * s.cutTop * 0.8, false);
  }
  if (s.chip) {
    // A broken slug: a bite out of the letter that never prints.
    sx.globalCompositeOperation = 'destination-out';
    const cx = ox + s.chip.x * sizePx;
    const cy = oy + s.chip.y * sizePx;
    const cr = s.chip.r * sizePx;
    const g = sx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.95)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = g;
    sx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
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
  drawBlurred(hx, ink, Math.max(0.4, (0.0015 + 0.009 * amount) * ppi));
  // break the halo up along the fibers so it feathers rather than glows
  const tile = speckle(160, seed, 'bleed', 0.45, 0.6);
  const pat = hx.createPattern(tile as CanvasImageSource, 'repeat');
  if (pat) {
    pat.setTransform?.(new DOMMatrix().translate(-ox, -oy).scale(Math.max(0.5, ppi / 260)));
    hx.globalCompositeOperation = 'destination-out';
    hx.globalAlpha = 0.55;
    hx.fillStyle = pat;
    hx.fillRect(0, 0, w, h);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.globalAlpha = Math.min(0.9, 0.22 + 0.6 * amount);
  ctx.drawImage(halo as CanvasImageSource, 0, 0);
  ctx.restore();
  release(halo);
}

/**
 * Fabric ribbons print through a weave: ink breaks up into fine speckle,
 * more so as the ribbon dries and on toothy paper. Film prints solid.
 */
function applyRibbonTexture(ctx: Ctx2D, w: number, h: number, ppi: number, seed: number, ribbon: Settings['look']['ribbon'], a: FlawAmounts, ox = 0, oy = 0, tooth = 1) {
  const dry = 1 - a.ink;
  if (ribbon === 'film' && dry < 0.6) return;
  const tilePx = 192;
  const density = (ribbon === 'film' ? 0.05 : (ribbon === 'carbon' ? 0.22 : 0.12) + 0.22 * dry * dry + 0.05 * a.grain) * tooth;
  const tile = speckle(tilePx, seed, `ribbon/${ribbon}`, Math.min(0.6, density), ribbon === 'carbon' ? 0.8 : 0.35);
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

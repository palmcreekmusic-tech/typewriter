// Paper: base color, cloudy formation, fine grain and fibers, plus aging for
// old stock. Built once per size/seed and cached; typing never rebuilds it.

import type { PaperKind } from '../engine/types';
import { rngFor } from '../engine/rng';
import { makeCanvas, ctx2d, release, type AnyCanvas } from './canvas';
import { valueNoise, grainTile } from './noise';

interface PaperSpec {
  /** neutral and warm ends of the base color; paperTone blends between them */
  cool: [number, number, number];
  warm: [number, number, number];
  mottle: number;
  grain: number;
  fibers: number;
  aging: number;
  foxing: number;
  /** how readily ink wicks into the sheet: hard-sized bond ~1, newsprint soaks, coated sticky notes barely take it */
  absorb: number;
  /** surface roughness that breaks the ink up */
  tooth: number;
}

const SPECS: Record<PaperKind, PaperSpec> = {
  bond: { cool: [247, 246, 241], warm: [246, 239, 222], mottle: 0.16, grain: 0.1, fibers: 0.5, aging: 0, foxing: 0, absorb: 1, tooth: 1 },
  cream: { cool: [245, 238, 220], warm: [243, 228, 196], mottle: 0.2, grain: 0.12, fibers: 0.7, aging: 0.1, foxing: 0, absorb: 1, tooth: 1 },
  aged: { cool: [236, 224, 196], warm: [228, 206, 162], mottle: 0.32, grain: 0.14, fibers: 0.8, aging: 0.75, foxing: 1, absorb: 1.15, tooth: 1.1 },
  onionskin: { cool: [244, 243, 237], warm: [240, 236, 222], mottle: 0.1, grain: 0.07, fibers: 1, aging: 0, foxing: 0, absorb: 0.85, tooth: 0.9 },
  // groundwood pulp, unsized and grey: ink soaks in and greys out
  newsprint: { cool: [228, 225, 213], warm: [222, 212, 186], mottle: 0.24, grain: 0.2, fibers: 1.5, aging: 0.25, foxing: 0, absorb: 1.9, tooth: 1.6 },
  // a smooth coated note: ink sits on top, crisp and even
  sticky: { cool: [248, 228, 96], warm: [244, 214, 74], mottle: 0.05, grain: 0.04, fibers: 0.12, aging: 0, foxing: 0, absorb: 0.5, tooth: 0.55 },
};

export function paperBaseColor(kind: PaperKind, tone: number): string {
  const s = SPECS[kind];
  const t = Math.max(0, Math.min(1, tone));
  const c = s.cool.map((v, i) => Math.round(v + (s.warm[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const cache = new Map<string, AnyCanvas>();

/** Draws a throwaway texture and frees it. */
function drawOnce(ctx: ReturnType<typeof ctx2d>, c: AnyCanvas) {
  ctx.drawImage(c as CanvasImageSource, 0, 0);
  release(c);
}

/**
 * @param wIn,hIn paper size in inches
 * @param ppi output pixels per inch
 * @param grain 0 smooth .. 1 very toothy (0.5 = the stock as it comes)
 */
export function paperTexture(kind: PaperKind, tone: number, wIn: number, hIn: number, ppi: number, seed: number, grain = 0.5, stains = 0): AnyCanvas {
  const key = [kind, tone.toFixed(2), wIn.toFixed(3), hIn.toFixed(3), Math.round(ppi), seed, grain.toFixed(2), stains.toFixed(2)].join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const w = Math.round(wIn * ppi);
  const h = Math.round(hIn * ppi);
  const g = 0.2 + 2.4 * grain ** 1.4;
  const base = SPECS[kind];
  const spec = { ...base, mottle: base.mottle * Math.min(g, 1.5), grain: Math.min(0.5, base.grain * g), fibers: base.fibers * (0.5 + grain) };
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);

  ctx.fillStyle = paperBaseColor(kind, tone);
  ctx.fillRect(0, 0, w, h);

  // Formation: the cloudy look of pulp settling unevenly, two scales.
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = spec.mottle;
  drawOnce(ctx, valueNoise(w, h, ppi * 0.6, rngFor(seed, 'paper', 'mottle-a')));
  ctx.globalAlpha = spec.mottle * 0.7;
  drawOnce(ctx, valueNoise(w, h, ppi * 0.12, rngFor(seed, 'paper', 'mottle-b')));

  // Fine tooth of the sheet.
  ctx.globalAlpha = spec.grain;
  const tile = grainTile(256, rngFor(seed, 'paper', 'grain'), 0.9);
  const pat = ctx.createPattern(tile as CanvasImageSource, 'repeat');
  if (pat) {
    // grain is about 1/250 inch however large we render
    const k = Math.max(1, ppi / 250);
    pat.setTransform?.(new DOMMatrix().scale(k, k));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  drawFibers(ctx, w, h, ppi, spec.fibers, seed);
  if (spec.aging > 0) drawAging(ctx, w, h, ppi, spec, seed);
  if (stains > 0.08) drawStains(ctx, w, h, ppi, stains, seed);

  // full sheets are big; keep just the last few (dragging a slider makes many)
  while (cache.size >= 3) {
    const [k, old] = cache.entries().next().value!;
    cache.delete(k);
    release(old);
  }
  cache.set(key, c);
  return c;
}

function drawFibers(ctx: ReturnType<typeof ctx2d>, w: number, h: number, ppi: number, amount: number, seed: number) {
  const r = rngFor(seed, 'paper', 'fibers');
  const count = Math.round(((w * h) / (ppi * ppi)) * 9 * amount);
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = ppi * (0.03 + r() * 0.09);
    const a = r() * Math.PI * 2;
    const bend = (r() - 0.5) * len * 0.8;
    const light = r() < 0.55;
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(110,90,60,0.10)';
    ctx.lineWidth = Math.max(0.5, ppi * (0.0012 + r() * 0.0015));
    ctx.beginPath();
    ctx.moveTo(x, y);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    ctx.quadraticCurveTo((x + ex) / 2 - Math.sin(a) * bend, (y + ey) / 2 + Math.cos(a) * bend, ex, ey);
    ctx.stroke();
  }
}

function drawAging(ctx: ReturnType<typeof ctx2d>, w: number, h: number, ppi: number, spec: PaperSpec, seed: number) {
  const r = rngFor(seed, 'paper', 'aging');
  // Edges yellow and darken first, where air and light reach the sheet.
  ctx.globalCompositeOperation = 'multiply';
  const edge = Math.min(w, h) * 0.22;
  const g = (x0: number, y0: number, x1: number, y1: number) => {
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, `rgba(176,128,62,${0.38 * spec.aging})`);
    grad.addColorStop(1, 'rgba(176,128,62,0)');
    return grad;
  };
  ctx.fillStyle = g(0, 0, edge, 0);
  ctx.fillRect(0, 0, edge, h);
  ctx.fillStyle = g(w, 0, w - edge, 0);
  ctx.fillRect(w - edge, 0, edge, h);
  ctx.fillStyle = g(0, 0, 0, edge);
  ctx.fillRect(0, 0, w, edge);
  ctx.fillStyle = g(0, h, 0, h - edge);
  ctx.fillRect(0, h - edge, w, edge);

  // Blotchy uneven toning.
  ctx.globalAlpha = 0.35 * spec.aging;
  drawOnce(ctx, valueNoise(w, h, ppi * 1.4, rngFor(seed, 'paper', 'toning'), 1.2));
  ctx.globalAlpha = 1;

  // Foxing: clusters of small rust-brown specks.
  const clusters = Math.round(((w * h) / (ppi * ppi)) * 0.12 * spec.foxing);
  for (let i = 0; i < clusters; i++) {
    const cx = r() * w;
    const cy = r() * h;
    const n = 3 + Math.floor(r() * 14);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * ppi * 0.35;
      const y = cy + (r() - 0.5) * ppi * 0.35;
      const rad = ppi * (0.004 + r() * r() * 0.03);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(150,92,40,${0.25 + r() * 0.35})`);
      grad.addColorStop(1, 'rgba(150,92,40,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Coffee: a mug set down on the page leaves a ring, darker at the rim where
 * the liquid dried, often doubled where it was lifted and set down again,
 * plus a few drips. Sheet-relative sizes, so a caption strip gets a corner
 * of a ring rather than a tiny whole one.
 */
function drawStains(ctx: ReturnType<typeof ctx2d>, w: number, h: number, ppi: number, amount: number, seed: number) {
  const r = rngFor(seed, 'paper', 'stains');
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const rings = amount < 0.35 ? 1 : amount < 0.75 ? 2 : 3;
  const strength = 0.35 + 0.65 * Math.min(1, amount * 1.3);
  for (let i = 0; i < rings; i++) {
    // mugs are about 3 inches across; rings tend to sit near an edge
    const rad = ppi * (1.35 + r() * 0.3);
    const cx = r() < 0.6 ? (r() < 0.5 ? r() * 0.3 : 0.7 + r() * 0.3) * w : r() * w;
    const cy = r() * h;
    coffeeRing(ctx, cx, cy, rad, ppi, strength, r, Math.PI * 2);
    // set down again a little off: a second, partial ring
    if (r() < 0.45) coffeeRing(ctx, cx + (r() - 0.5) * ppi * 0.4, cy + (r() - 0.5) * ppi * 0.4, rad * (0.98 + r() * 0.04), ppi, strength * 0.6, r, Math.PI * (0.5 + r()));
  }
  // drips: small splashes, each a few overlapping drops dried darker at the edge
  const drips = Math.round(amount * 7);
  for (let i = 0; i < drips; i++) {
    const x = r() * w;
    const y = r() * h;
    const size = ppi * (0.02 + r() * r() * 0.1);
    const n = 1 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const dx = x + (r() - 0.5) * size * 1.6;
      const dy = y + (r() - 0.5) * size * 1.6;
      const rad = size * (0.35 + 0.65 * r());
      const g = ctx.createRadialGradient(dx, dy, rad * 0.3, dx, dy, rad);
      g.addColorStop(0, `rgba(196,150,96,${0.1 * strength})`);
      g.addColorStop(0.82, `rgba(160,104,50,${0.22 * strength})`);
      g.addColorStop(0.95, `rgba(140,88,40,${0.38 * strength})`);
      g.addColorStop(1, 'rgba(140,88,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(dx, dy, rad, rad * (0.7 + r() * 0.3), r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * One ring left by a mug's base: a band whose width and darkness wander
 * round the circle, with a crisp dark outer edge where the coffee dried
 * last, a soft inner edge, gaps where the mug didn't sit flat, and a faint
 * blotchy tint inside.
 */
function coffeeRing(ctx: ReturnType<typeof ctx2d>, cx: number, cy: number, rad: number, ppi: number, a: number, r: () => number, span: number) {
  const ph = [r(), r(), r(), r(), r(), r()].map((v) => v * Math.PI * 2);
  const wander = (t: number, k: number) => 0.5 + 0.28 * Math.sin(t * 2 + ph[k]) + 0.14 * Math.sin(t * 5 + ph[k + 1]) + 0.08 * Math.sin(t * 11 + ph[k + 2]);
  const start = r() * Math.PI * 2;
  if (span >= Math.PI * 2) {
    const fill = ctx.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
    fill.addColorStop(0, `rgba(200,160,110,${0.04 * a})`);
    fill.addColorStop(0.85, `rgba(186,136,80,${0.09 * a})`);
    fill.addColorStop(1, 'rgba(186,136,80,0)');
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const steps = Math.ceil((span / (Math.PI * 2)) * 220);
  ctx.lineCap = 'butt';
  for (let i = 0; i < steps; i++) {
    const t0 = start + (span * i) / steps;
    const t1 = start + (span * (i + 1)) / steps + 0.002;
    const tm = (t0 + t1) / 2;
    const dark = wander(tm, 0);
    // gaps where the rim barely touched
    const on = Math.max(0, Math.min(1, (dark - 0.18) * 2.2));
    if (on <= 0.01) continue;
    const band = ppi * (0.025 + 0.07 * wander(tm, 3));
    const rr = rad * (1 + 0.006 * Math.sin(tm * 3 + ph[5]));
    // soft body of the band
    ctx.strokeStyle = `rgba(176,122,64,${0.13 * a * on})`;
    ctx.lineWidth = band;
    ctx.beginPath();
    ctx.arc(cx, cy, rr - band / 2, t0, t1);
    ctx.stroke();
    // the crisp outer tide line
    ctx.strokeStyle = `rgba(128,78,34,${0.42 * a * on * (0.5 + dark)})`;
    ctx.lineWidth = Math.max(0.7, ppi * (0.006 + 0.008 * dark));
    ctx.beginPath();
    ctx.arc(cx, cy, rr, t0, t1);
    ctx.stroke();
  }
}

/**
 * Folds, drawn over the ink: a letter folded in thirds for the envelope,
 * then in half again when it's pushed further. Each crease is a dark valley
 * with a light ridge beside it and a soft shade where the sheet still bows.
 */
export function drawFolds(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number, ppi: number, amount: number, seed: number) {
  if (amount < 0.02) return;
  const r = rngFor(seed, 'paper', 'folds');
  const creases: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const skew = () => (r() - 0.5) * ppi * 0.08;
  if (h > w * 1.1) {
    // a letter: thirds, then a vertical half fold for the strongest settings
    for (const f of [1 / 3, 2 / 3]) {
      const y = h * f + (r() - 0.5) * ppi * 0.15;
      creases.push({ x0: 0, y0: y + skew(), x1: w, y1: y + skew() });
    }
    if (amount > 0.6) {
      const x = w / 2 + (r() - 0.5) * ppi * 0.15;
      creases.push({ x0: x + skew(), y0: 0, x1: x + skew(), y1: h });
    }
  } else {
    // a caption strip: folded once across
    const x = w * (0.35 + r() * 0.3);
    creases.push({ x0: x + skew(), y0: 0, x1: x + skew(), y1: h });
    if (amount > 0.6) {
      const y = h / 2 + skew();
      creases.push({ x0: 0, y0: y + skew(), x1: w, y1: y + skew() });
    }
  }
  const a = Math.min(1, amount * 1.2);
  ctx.save();
  for (const c of creases) {
    const len = Math.hypot(c.x1 - c.x0, c.y1 - c.y0);
    const nx = -(c.y1 - c.y0) / len;
    const ny = (c.x1 - c.x0) / len;
    // the bow of the paper either side of the crease
    const bow = ppi * (0.35 + 0.25 * a);
    const mx = (c.x0 + c.x1) / 2;
    const my = (c.y0 + c.y1) / 2;
    const g = ctx.createLinearGradient(mx - nx * bow, my - ny * bow, mx + nx * bow, my + ny * bow);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.42, `rgba(255,255,255,${0.1 * a})`);
    g.addColorStop(0.5, `rgba(80,60,40,${0.1 * a})`);
    g.addColorStop(0.62, `rgba(80,60,40,${0.05 * a})`);
    g.addColorStop(1, 'rgba(80,60,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(c.x0 - nx * bow, c.y0 - ny * bow);
    ctx.lineTo(c.x1 - nx * bow, c.y1 - ny * bow);
    ctx.lineTo(c.x1 + nx * bow, c.y1 + ny * bow);
    ctx.lineTo(c.x0 + nx * bow, c.y0 + ny * bow);
    ctx.fill();
    // the crease itself: a broken dark line and a light ridge beside it
    const steps = Math.ceil(len / (ppi * 0.05));
    for (const [off, col, lw] of [
      [0, `rgba(70,52,34,${0.4 * a})`, 0.008],
      [0.012, `rgba(255,255,255,${0.45 * a})`, 0.01],
    ] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.6, ppi * lw);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wob = (r() - 0.5) * ppi * 0.004;
        const x = c.x0 + (c.x1 - c.x0) * t + nx * (off * ppi + wob);
        const y = c.y0 + (c.y1 - c.y0) * t + ny * (off * ppi + wob);
        if (i && r() > 0.06) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Ink wicking and surface roughness for each paper. */
export function paperInk(kind: PaperKind): { absorb: number; tooth: number } {
  const s = SPECS[kind] ?? SPECS.bond;
  return { absorb: s.absorb, tooth: s.tooth };
}

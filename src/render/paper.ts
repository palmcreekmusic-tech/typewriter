// Paper: base color, cloudy formation, fine grain and fibers, plus aging for
// old stock. Built once per size/seed and cached; typing never rebuilds it.

import type { PaperKind } from '../engine/types';
import { rngFor } from '../engine/rng';
import { makeCanvas, ctx2d, type AnyCanvas } from './canvas';
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
}

const SPECS: Record<PaperKind, PaperSpec> = {
  bond: { cool: [247, 246, 241], warm: [246, 239, 222], mottle: 0.16, grain: 0.1, fibers: 0.5, aging: 0, foxing: 0 },
  cream: { cool: [245, 238, 220], warm: [243, 228, 196], mottle: 0.2, grain: 0.12, fibers: 0.7, aging: 0.1, foxing: 0 },
  aged: { cool: [236, 224, 196], warm: [228, 206, 162], mottle: 0.32, grain: 0.14, fibers: 0.8, aging: 0.75, foxing: 1 },
  onionskin: { cool: [244, 243, 237], warm: [240, 236, 222], mottle: 0.1, grain: 0.07, fibers: 1, aging: 0, foxing: 0 },
};

export function paperBaseColor(kind: PaperKind, tone: number): string {
  const s = SPECS[kind];
  const t = Math.max(0, Math.min(1, tone));
  const c = s.cool.map((v, i) => Math.round(v + (s.warm[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const cache = new Map<string, AnyCanvas>();

/**
 * @param wIn,hIn paper size in inches
 * @param ppi output pixels per inch
 * @param grain 0 smooth .. 1 very toothy (0.5 = the stock as it comes)
 */
export function paperTexture(kind: PaperKind, tone: number, wIn: number, hIn: number, ppi: number, seed: number, grain = 0.5): AnyCanvas {
  const key = [kind, tone.toFixed(2), wIn.toFixed(3), hIn.toFixed(3), Math.round(ppi), seed, grain.toFixed(2)].join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const w = Math.round(wIn * ppi);
  const h = Math.round(hIn * ppi);
  const g = 0.2 + 2.4 * grain ** 1.4;
  const base = SPECS[kind];
  const spec = { ...base, mottle: base.mottle * g, grain: Math.min(0.5, base.grain * g), fibers: base.fibers * (0.5 + grain) };
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);

  ctx.fillStyle = paperBaseColor(kind, tone);
  ctx.fillRect(0, 0, w, h);

  // Formation: the cloudy look of pulp settling unevenly, two scales.
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = spec.mottle;
  ctx.drawImage(valueNoise(w, h, ppi * 0.6, rngFor(seed, 'paper', 'mottle-a')), 0, 0);
  ctx.globalAlpha = spec.mottle * 0.7;
  ctx.drawImage(valueNoise(w, h, ppi * 0.12, rngFor(seed, 'paper', 'mottle-b')), 0, 0);

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

  if (cache.size > 12) cache.delete(cache.keys().next().value!);
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
  ctx.drawImage(valueNoise(w, h, ppi * 1.4, rngFor(seed, 'paper', 'toning'), 1.2), 0, 0);
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

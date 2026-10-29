// Draws the print: photo paper, the photo, and the frame around it. Only the
// band along the edges is worked pixel by pixel; the middle of the picture
// is the photo as it is.

import { makeCanvas, ctx2d, release, type AnyCanvas } from '../render/canvas';
import { edgeTextAt, edgeTextLayout, frameDistances, smoothstep } from './frame';
import type { PrintPlan } from './plan';

export type PhotoSource = CanvasImageSource & { width: number; height: number };

/** Fibre-based paper: a touch warm, never pure white. */
export const PHOTO_PAPER: [number, number, number] = [250, 248, 242];

function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

let cached: { key: string; canvas: AnyCanvas } | null = null;

/** The print at ppi, without the caption. */
export function renderPrint(photo: PhotoSource, photoId: string, plan: PrintPlan, ppi: number, seed: number): AnyCanvas {
  const key = [photoId, ppi, seed, JSON.stringify({ ...plan, geom: plan.geom ? [plan.geom.border, plan.geom.fullW, plan.geom.fullH] : null })].join('|');
  if (cached?.key === key) return cached.canvas;
  if (cached) release(cached.canvas);
  const W = Math.round(plan.width * ppi);
  const H = Math.round(plan.height * ppi);
  const canvas = makeCanvas(W, H);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = `rgb(${PHOTO_PAPER.join(',')})`;
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  const im = plan.image;
  ctx.drawImage(photo, im.x * ppi, im.y * ppi, im.w * ppi, im.h * ppi);
  if (plan.geom) drawFrame(ctx, plan, ppi, seed);
  cached = { key, canvas };
  return canvas;
}

function drawFrame(ctx: ReturnType<typeof ctx2d>, plan: PrintPlan, ppi: number, seed: number) {
  const g = plan.geom!;
  const fx = Math.round(plan.frame.x * ppi);
  const fy = Math.round(plan.frame.y * ppi);
  const W = Math.round(plan.frame.w * ppi);
  const H = Math.round(plan.frame.h * ppi);
  const img = ctx.getImageData(fx, fy, W, H);
  const D = img.data;
  const px = 1 / ppi;
  const fe = Math.max(g.feather, px * 0.7);
  const ofe = Math.max(g.oFeather, px * 0.7);
  const T = edgeTextLayout(g, seed);
  const zone = g.zone + (T ? T.gap + T.h : 0);
  // a print's black is the paper's maximum density; a scan's is unexposed film
  const rebate = g.print ? 22 : 13;
  const ink = g.print ? [40, 36, 32] : [150, 104, 42];
  const mseed = (seed * 7919 + 11) >>> 0;
  const burnAmt = 0.06;
  const row = (y: number, xa: number, xb: number) => {
    const Y = (y + 0.5) * px;
    for (let x = xa; x < xb; x++) {
      const X = (x + 0.5) * px;
      const d = frameDistances(g, X, Y);
      const inside = g.outerKind ? smoothstep(-ofe, ofe, d.dOuter) : 1;
      const m = g.outerKind === 'easel' ? inside : smoothstep(-fe, fe, d.dGate);
      const burn = g.burnW ? 1 - burnAmt * inside * (1 - smoothstep(0, g.burnW, d.dGate)) : 1;
      if (m >= 1 && inside >= 1 && burn >= 1) continue;
      const i = (y * W + x) * 4;
      // base + fog is never perfectly even: faint mottle and fine grain
      const mot = (vnoise(X / (0.012 * g.S), Y / (0.012 * g.S), mseed) - 0.5) * 5 + (hash2(x, y, mseed) - 0.5) * 6;
      const txt = T && m < 1 ? edgeTextAt(T, g, d.u, d.w) : 0;
      // beyond the opening: white paper, or the filed carrier's black metal
      const out = g.white ? PHOTO_PAPER : [6, 6, 6];
      for (let k = 0; k < 3; k++) {
        const reb = rebate + mot + txt * (ink[k] - rebate);
        const pic = D[i + k] * burn * m + reb * (1 - m);
        D[i + k] = pic * inside + out[k] * (1 - inside);
      }
    }
  };
  for (let y = 0; y < H; y++) {
    const Y = (y + 0.5) * px;
    if (Y > zone && Y < plan.frame.h - zone) {
      // only the left and right bands of this row can be near the frame
      const za = Math.min(W, Math.ceil(zone * ppi));
      row(y, 0, za);
      row(y, Math.max(za, Math.floor((plan.frame.w - zone) * ppi)), W);
    } else row(y, 0, W);
  }
  ctx.putImageData(img, fx, fy);
}

/** A stand-in photo until you pick one: dusk over low hills. */
export function samplePhoto(): AnyCanvas {
  const w = 900;
  const h = 600;
  const c = makeCanvas(w, h);
  const x = ctx2d(c);
  const sky = x.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, '#5d6f80');
  sky.addColorStop(0.6, '#c9a98a');
  sky.addColorStop(1, '#e6c7a0');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  const hill = (y0: number, amp: number, color: string, f: number) => {
    x.beginPath();
    x.moveTo(0, h);
    for (let i = 0; i <= w; i += 6) x.lineTo(i, y0 + Math.sin(i * f) * amp + Math.sin(i * f * 2.7 + 1) * amp * 0.4);
    x.lineTo(w, h);
    x.fillStyle = color;
    x.fill();
  };
  hill(h * 0.58, 14, '#6d6a62', 0.008);
  hill(h * 0.7, 20, '#4a4a43', 0.005);
  hill(h * 0.84, 10, '#2f302b', 0.011);
  return c;
}

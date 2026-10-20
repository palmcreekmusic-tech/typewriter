// Cheap seeded noise textures built from canvases, fast enough to make 4K paper.

import type { Rng } from '../engine/rng';
import { makeCanvas, ctx2d, release, drawBlurred, type AnyCanvas } from './canvas';

/**
 * Smooth grey value noise: a small random grid scaled up with bilinear
 * smoothing. `cell` is the feature size in output pixels. Values sit around
 * mid grey, so it composites neutrally with 'overlay' or 'soft-light'.
 */
export function valueNoise(w: number, h: number, cell: number, rng: Rng, contrast = 1): AnyCanvas {
  const gw = Math.max(2, Math.ceil(w / cell) + 2);
  const gh = Math.max(2, Math.ceil(h / cell) + 2);
  const small = makeCanvas(gw, gh);
  const sctx = ctx2d(small);
  const img = sctx.createImageData(gw, gh);
  for (let i = 0; i < gw * gh; i++) {
    const v = 128 + (rng() - 0.5) * 255 * contrast;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);
  const out = makeCanvas(w, h);
  const octx = ctx2d(out);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  // offset by half a cell so the grid edges never show
  octx.drawImage(small, -cell * 0.5, -cell * 0.5, gw * cell, gh * cell);
  release(small);
  return out;
}

/** Per-pixel grain tile (repeat it with a pattern). */
export function grainTile(size: number, rng: Rng, contrast = 1): AnyCanvas {
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (rng() - 0.5) * 255 * contrast;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Alpha-only speckle tile: transparent with random opaque specks, for eating into ink. */
export function speckleTile(size: number, rng: Rng, density: number, blur = 0): AnyCanvas {
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const r = rng();
    img.data[i * 4 + 3] = r < density ? 255 * (0.4 + 0.6 * rng()) : 0;
  }
  ctx.putImageData(img, 0, 0);
  if (blur > 0) {
    const b = makeCanvas(size, size);
    const bctx = ctx2d(b);
    // draw 3x3 so the blur wraps across tile edges
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) drawBlurred(bctx, c, blur, x * size, y * size);
    release(c);
    return b;
  }
  return c;
}

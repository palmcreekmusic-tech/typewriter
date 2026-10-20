export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): AnyCanvas {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: AnyCanvas): Ctx2D {
  const ctx = c.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('Canvas 2D is not available');
  return ctx;
}

/**
 * Hands a canvas's memory back straight away. Safari keeps a hard cap on
 * canvas memory and frees it lazily, so canvases we're done with are shrunk
 * to nothing rather than left for the garbage collector.
 */
export function release(c: AnyCanvas | null | undefined) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

let filterOk: boolean | undefined;
/** Safari (before 18) ignores ctx.filter, so blur has a fallback. */
export function canFilter(): boolean {
  if (filterOk === undefined) {
    try {
      const x = ctx2d(makeCanvas(1, 1));
      x.filter = 'blur(1px)';
      filterOk = x.filter === 'blur(1px)';
    } catch {
      filterOk = false;
    }
  }
  return filterOk;
}

/**
 * Draws `src` into `ctx` blurred by about `radius` px. Uses ctx.filter where
 * it works; elsewhere it averages offset copies, which is close enough for
 * ink halos and soft specks.
 */
export function drawBlurred(ctx: Ctx2D, src: AnyCanvas, radius: number, dx = 0, dy = 0) {
  if (canFilter()) {
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(src as CanvasImageSource, dx, dy);
    ctx.filter = 'none';
    return;
  }
  // two box passes of 3x3 taps, summed with 'lighter' so the taps average
  const w = src.width;
  const h = src.height;
  const tmp = makeCanvas(w, h);
  const t = ctx2d(tmp);
  const pass = (to: Ctx2D, from: AnyCanvas, r: number, ox: number, oy: number) => {
    to.save();
    to.globalCompositeOperation = 'lighter';
    to.globalAlpha = 1 / 9;
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) to.drawImage(from as CanvasImageSource, ox + x * r, oy + y * r);
    to.restore();
  };
  pass(t, src, radius * 0.6, 0, 0);
  pass(ctx, tmp, radius * 0.35, dx, dy);
  release(tmp);
}

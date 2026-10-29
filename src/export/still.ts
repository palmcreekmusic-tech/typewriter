// Still exports: a PNG of the sheet, on its paper or as ink alone on
// transparent, and a PDF of every page. They are drawn by the same
// renderPage as the screen, at print resolution.

import { renderPage, type RenderOptions } from '../render/page';
import { makeCanvas, ctx2d, release, type AnyCanvas } from '../render/canvas';
import { buildPdf, rgbaPlanes, type PdfPage } from './pdf';
import { stillPpi, type Tier } from './plan';
import type { Layout } from '../engine/layout';

export type StillInput = Omit<RenderOptions, 'page' | 'ppi' | 'withPaper' | 'print'> & {
  /** photo mode: draws the print at a resolution */
  print?: (ppi: number) => RenderOptions['print'];
};

export interface StillOptions {
  paper: boolean;
  tier: Tier;
}

export function sheetPpi(layout: Layout, page: number, tier: Tier) {
  const pg = layout.pages[page] ?? layout.pages[0];
  return stillPpi(pg.width, pg.height, tier);
}

/** One sheet, drawn at the tier's resolution. */
export function renderSheet(input: StillInput, page: number, o: StillOptions): AnyCanvas {
  const pg = input.layout.pages[page] ?? input.layout.pages[0];
  const ppi = sheetPpi(input.layout, page, o.tier);
  const c = makeCanvas(pg.width * ppi, pg.height * ppi);
  const ctx = ctx2d(c);
  renderPage(ctx, { ...input, page, ppi, withPaper: o.paper, print: o.paper ? input.print?.(ppi) : undefined });
  if (o.tier.mark) stampMark(ctx, c.width, c.height, o.paper);
  return c;
}

/**
 * "typed with type[writer]", small in the bottom corner, on free exports.
 * Quiet enough to live with, plain enough to read.
 */
export function stampMark(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number, onPaper = true) {
  const size = Math.max(9, Math.round(Math.min(w, h) * 0.022));
  const pad = Math.round(size * 1.1);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = `500 ${size}px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = onPaper ? 'rgba(40, 36, 30, 0.42)' : 'rgba(40, 36, 30, 0.6)';
  ctx.fillText('typed with type[writer]', w - pad, h - pad);
  ctx.restore();
}

export async function toPng(c: AnyCanvas): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/png' });
  return new Promise((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
}

async function toJpeg(c: AnyCanvas): Promise<Uint8Array> {
  const b = 'convertToBlob' in c ? await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 }) : await new Promise<Blob>((res, rej) => (c as HTMLCanvasElement).toBlob((x) => (x ? res(x) : rej(new Error('JPEG failed'))), 'image/jpeg', 0.92));
  return new Uint8Array(await b.arrayBuffer());
}

/** Every page, one after another, as a PDF at the page's real size. */
export async function toPdf(input: StillInput, o: StillOptions): Promise<Blob> {
  const pages: PdfPage[] = [];
  for (let i = 0; i < input.layout.pages.length; i++) {
    const pg = input.layout.pages[i];
    const c = renderSheet(input, i, o);
    if (o.paper) pages.push({ width: pg.width, height: pg.height, image: { kind: 'jpeg', w: c.width, h: c.height, data: await toJpeg(c) } });
    else {
      const px = ctx2d(c).getImageData(0, 0, c.width, c.height).data;
      pages.push({ width: pg.width, height: pg.height, image: { kind: 'rgba', w: c.width, h: c.height, ...(await rgbaPlanes(px, c.width, c.height)) } });
    }
    release(c);
  }
  return buildPdf(pages);
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

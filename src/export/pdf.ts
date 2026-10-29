// A small PDF writer: one full-page picture per page, nothing else. Paper
// goes in as JPEG; ink on transparent goes in as deflated RGB with its alpha
// as a soft mask, so it drops onto anything.

export interface PdfPage {
  /** inches */
  width: number;
  height: number;
  image: { kind: 'jpeg'; w: number; h: number; data: Uint8Array } | { kind: 'rgba'; w: number; h: number; rgb: Uint8Array; alpha: Uint8Array };
}

const enc = new TextEncoder();

export function buildPdf(pages: PdfPage[], title = 'type[writer]'): Blob {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    parts.push(u);
    size += u.length;
  };
  // object numbers: 1 catalog, 2 pages, 3 info, then per page: page, content, image, [mask]
  let next = 4;
  const plan = pages.map((p) => {
    const ids = { page: next++, content: next++, image: next++, mask: p.image.kind === 'rgba' ? next++ : 0 };
    return { p, ids };
  });
  const obj = (id: number, dict: string, stream?: Uint8Array) => {
    offsets[id] = size;
    push(`${id} 0 obj\n${dict}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${plan.map((x) => `${x.ids.page} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  obj(3, `<< /Title (${title.replace(/[()\\]/g, '\\$&')}) /Producer (type[writer]) >>`);
  for (const { p, ids } of plan) {
    const W = +(p.width * 72).toFixed(2);
    const H = +(p.height * 72).toFixed(2);
    const content = enc.encode(`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`);
    obj(ids.page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${ids.image} 0 R >> >> /Contents ${ids.content} 0 R >>`);
    obj(ids.content, `<< /Length ${content.length} >>`, content);
    const im = p.image;
    if (im.kind === 'jpeg') {
      obj(ids.image, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>`, im.data);
    } else {
      obj(ids.image, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${ids.mask} 0 R /Length ${im.rgb.length} >>`, im.rgb);
      obj(ids.mask, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${im.alpha.length} >>`, im.alpha);
    }
  }
  const xref = size;
  push(`xref\n0 ${next}\n0000000000 65535 f \n`);
  for (let i = 1; i < next; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${next} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/** zlib deflate, which is what PDF's FlateDecode reads. */
export async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Splits straight RGBA into deflated RGB and alpha planes. */
export async function rgbaPlanes(px: Uint8ClampedArray, w: number, h: number) {
  const rgb = new Uint8Array(w * h * 3);
  const alpha = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    rgb[i * 3] = px[j];
    rgb[i * 3 + 1] = px[j + 1];
    rgb[i * 3 + 2] = px[j + 2];
    alpha[i] = px[j + 3];
  }
  return { rgb: await deflate(rgb), alpha: await deflate(alpha) };
}

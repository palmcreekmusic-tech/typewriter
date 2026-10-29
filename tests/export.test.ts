import { describe, expect, it } from 'vitest';
import { buildPdf } from '../src/export/pdf';
import { FREE, PRO, fileName, stillPpi } from '../src/export/plan';

describe('saving', () => {
  it('free stills stop at 1080 px on the long edge; Pro prints at 300 ppi', () => {
    expect(11 * stillPpi(8.5, 11, FREE)).toBeCloseTo(1080);
    expect(stillPpi(8.5, 11, PRO)).toBe(300);
    expect(stillPpi(1, 0.5, FREE)).toBe(300);
  });

  it('names the file after the first words', () => {
    expect(fileName("Grandma's lemon cake\n2 cups flour", 'png')).toBe('grandmas-lemon-cake-2-cups.png');
    expect(fileName('  ', 'pdf')).toBe('typewriter.pdf');
  });

  it('writes a PDF whose cross-reference table points at every object', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = new Uint8Array(
      await buildPdf([
        { width: 8.5, height: 11, image: { kind: 'jpeg', w: 1, h: 1, data: jpeg } },
        { width: 5, height: 3, image: { kind: 'rgba', w: 1, h: 1, rgb: new Uint8Array(3), alpha: new Uint8Array(1) } },
      ]).arrayBuffer(),
    );
    const s = new TextDecoder('latin1').decode(pdf);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s).toContain('/Count 2');
    expect(s).toContain('/MediaBox [0 0 612 792]');
    expect(s).toContain('/MediaBox [0 0 360 216]');
    const xref = +s.match(/startxref\n(\d+)/)![1];
    expect(s.slice(xref, xref + 4)).toBe('xref');
    const rows = s.slice(xref).split('\n').slice(3).filter((r) => / n $/.test(r));
    rows.forEach((r, i) => expect(s.slice(+r.slice(0, 10)).startsWith(`${i + 1} 0 obj`)).toBe(true));
    expect(rows).toHaveLength(10);
  });
});

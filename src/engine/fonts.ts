// The bundled typewriter faces. All are free to ship (OFL or Apache 2.0);
// license texts live next to the files in public/fonts/.

export interface FontDef {
  id: string;
  label: string;
  /** CSS family names; one per glyph variant (TT2020 has 9, the rest have 1). */
  families: string[];
  files: string[];
  /** type size relative to the cell, so faces with different proportions read the same */
  scale: number;
  /** extra stroke, in inches, that gives thin faces the body of a real inked strike */
  spread: number;
  license: string;
}

const tt2020 = (style: string, label: string, spread: number): FontDef => ({
  id: `tt2020-${style.toLowerCase()}`,
  label,
  families: Array.from({ length: 9 }, (_, v) => `TT2020${style}-${v}`),
  files: Array.from({ length: 9 }, (_, v) => `fonts/tt2020/TT2020${style}-${v}.woff2`),
  scale: 1,
  spread,
  license: 'SIL OFL 1.1',
});

export const FONTS: FontDef[] = [
  tt2020('B', 'TT2020 · bold strike', 0),
  tt2020('D', 'TT2020 · light touch', 0.009),
  tt2020('E', 'TT2020 · worn type', 0.009),
  {
    id: 'cutive-mono',
    label: 'Cutive Mono',
    families: ['Cutive Mono TW'],
    files: ['fonts/cutive-mono/cutive-mono.woff2'],
    spread: 0.0065,
    scale: 1,
    license: 'SIL OFL 1.1',
  },
  {
    id: 'courier-prime',
    label: 'Courier Prime',
    families: ['Courier Prime TW'],
    files: ['fonts/courier-prime/courier-prime.woff2'],
    spread: 0.0015,
    scale: 1,
    license: 'SIL OFL 1.1',
  },
  {
    id: 'special-elite',
    label: 'Special Elite',
    families: ['Special Elite TW'],
    files: ['fonts/special-elite/special-elite.woff2'],
    spread: 0,
    scale: 1,
    license: 'Apache 2.0',
  },
  {
    id: 'ibm-plex-mono',
    label: 'IBM Plex Mono',
    families: ['IBM Plex Mono TW'],
    files: ['fonts/ibm-plex-mono/ibm-plex-mono.woff2'],
    spread: 0.0015,
    scale: 0.94,
    license: 'SIL OFL 1.1',
  },
];

export function fontById(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

const loading = new Map<string, Promise<void>>();

/** Loads every variant of a font. Safe to call repeatedly. */
export function loadFont(def: FontDef, base = import.meta.env?.BASE_URL ?? './'): Promise<void> {
  let p = loading.get(def.id);
  if (!p) {
    p = Promise.all(
      def.families.map(async (family, i) => {
        const face = new FontFace(family, `url(${base}${def.files[i]})`);
        await face.load();
        (document.fonts as FontFaceSet & { add(f: FontFace): void }).add(face);
      }),
    ).then(() => undefined);
    p.catch(() => loading.delete(def.id));
    loading.set(def.id, p);
  }
  return p;
}

/** Width of one character as a fraction of the font size, measured once per font. */
const advanceCache = new Map<string, number>();
export function advanceRatio(def: FontDef, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): number {
  let r = advanceCache.get(def.id);
  if (r === undefined) {
    ctx.save();
    ctx.font = `100px "${def.families[0]}"`;
    r = ctx.measureText('MMMMMMMMMM').width / 1000;
    ctx.restore();
    if (r > 0.3 && r < 0.9) advanceCache.set(def.id, r);
    else r = 0.6;
  }
  return r;
}

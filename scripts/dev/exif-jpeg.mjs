// Adds a made-up EXIF block to a JPEG, for tests and screenshots.
//   node scripts/dev/exif-jpeg.mjs in.jpg out.jpg
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * fields: { make, model, lens, date: 'YYYY:MM:DD HH:MM:SS', fNumber, exposure, iso, focal, lat, lon }
 * Returns the APP1 segment (marker included).
 */
export function exifSegment(f) {
  // little-endian TIFF, built as IFD0 -> Exif IFD -> GPS IFD, values after each IFD
  const out = [];
  const u16 = (v) => out.push(v & 255, (v >> 8) & 255);
  const u32 = (v) => out.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
  const rat = (v) => {
    const d = v < 1 ? Math.round(1 / v) : 100;
    return v < 1 ? [1, d] : [Math.round(v * 100), 100];
  };
  // each entry: [tag, type, count, bytes]
  const ascii = (s) => [2, s.length + 1, [...Buffer.from(s + '\0', 'latin1')]];
  const short = (v) => [3, 1, [v & 255, v >> 8, 0, 0]];
  const long = (v) => [4, 1, [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]];
  const rats = (vs) => [5, vs.length, vs.flatMap((v) => { const [n, d] = rat(v); return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24, d & 255, (d >>> 8) & 255, (d >>> 16) & 255, d >>> 24]; })];
  const ifd = (entries, start) => {
    // entries sorted by tag; values that don't fit in 4 bytes go after the IFD
    let extra = start + 2 + entries.length * 12 + 4;
    const body = [];
    const tail = [];
    for (const [tag, [type, count, bytes]] of entries) {
      body.push(tag & 255, tag >> 8, type & 255, type >> 8, count & 255, (count >> 8) & 255, 0, 0);
      if (bytes.length <= 4) body.push(...bytes, ...Array(4 - bytes.length).fill(0));
      else {
        body.push(extra & 255, (extra >> 8) & 255, (extra >> 16) & 255, extra >>> 24);
        tail.push(...bytes);
        extra += bytes.length;
        if (bytes.length % 2) (tail.push(0), extra++);
      }
    }
    return [entries.length & 255, entries.length >> 8, ...body, 0, 0, 0, 0, ...tail];
  };
  const exifE = [];
  if (f.exposure) exifE.push([0x829a, rats([f.exposure])]);
  if (f.fNumber) exifE.push([0x829d, rats([f.fNumber])]);
  if (f.iso) exifE.push([0x8827, short(f.iso)]);
  if (f.date) exifE.push([0x9003, ascii(f.date)]);
  if (f.focal) exifE.push([0x920a, rats([f.focal])]);
  if (f.lens) exifE.push([0xa434, ascii(f.lens)]);
  const gpsE = [];
  if (f.lat !== undefined) {
    const dms = (v) => { v = Math.abs(v); const d = Math.floor(v); const m = Math.floor((v - d) * 60); return [d, m, Math.round(((v - d) * 60 - m) * 60 * 100) / 100]; };
    gpsE.push([1, ascii(f.lat < 0 ? 'S' : 'N')], [2, rats(dms(f.lat))], [3, ascii(f.lon < 0 ? 'W' : 'E')], [4, rats(dms(f.lon))]);
  }
  // two passes: sizes first, then real offsets
  const build = (exifAt, gpsAt) => {
    const e0 = [];
    if (f.make) e0.push([0x010f, ascii(f.make)]);
    if (f.model) e0.push([0x0110, ascii(f.model)]);
    e0.push([0x8769, long(exifAt)]);
    if (gpsE.length) e0.push([0x8825, long(gpsAt)]);
    const i0 = ifd(e0, 8);
    const ie = ifd(exifE, 8 + i0.length);
    const ig = gpsE.length ? ifd(gpsE, 8 + i0.length + ie.length) : [];
    return { i0, ie, ig };
  };
  let b = build(0, 0);
  b = build(8 + b.i0.length, 8 + b.i0.length + b.ie.length);
  out.push(0x49, 0x49, 42, 0);
  u32(8);
  out.push(...b.i0, ...b.ie, ...b.ig);
  const payload = [...Buffer.from('Exif\0\0', 'latin1'), ...out];
  const len = payload.length + 2;
  return Uint8Array.from([0xff, 0xe1, len >> 8, len & 255, ...payload]);
}

export function withExif(jpeg, fields) {
  const seg = exifSegment(fields);
  const a = new Uint8Array(jpeg);
  const r = new Uint8Array(a.length + seg.length);
  r.set(a.subarray(0, 2));
  r.set(seg, 2);
  r.set(a.subarray(2), 2 + seg.length);
  return r;
}

if (process.argv[1]?.endsWith('exif-jpeg.mjs') && process.argv[3]) {
  const fields = { make: 'NIKON CORPORATION', model: 'NIKON FM2', lens: 'Nikkor 35mm f/2', date: '1987:06:14 18:42:00', fNumber: 8, exposure: 1 / 250, iso: 400, focal: 35, lat: 37.3636, lon: -118.3951 };
  writeFileSync(process.argv[3], withExif(readFileSync(process.argv[2]), fields));
}

// Reads the few EXIF details a caption needs from a JPEG: when it was taken,
// on what camera and lens, the exposure, and where. Nothing leaves the
// device. Files without EXIF (or that aren't JPEGs) just give nothing.

export interface PhotoInfo {
  /** when the shutter fired, in the camera's own local time */
  date?: Date;
  make?: string;
  model?: string;
  lens?: string;
  /** e.g. 8 for f/8 */
  fNumber?: number;
  /** seconds */
  exposure?: number;
  iso?: number;
  /** mm */
  focal?: number;
  lat?: number;
  lon?: number;
}

const TAGS = {
  make: 0x010f,
  model: 0x0110,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  exposure: 0x829a,
  fNumber: 0x829d,
  iso: 0x8827,
  dateOriginal: 0x9003,
  focal: 0x920a,
  lens: 0xa434,
} as const;

type Value = string | number | number[] | undefined;

/** Parses the EXIF block of a JPEG. */
export function readExif(buf: ArrayBuffer): PhotoInfo {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return {};
  let o = 2;
  while (o + 4 <= v.byteLength) {
    if (v.getUint8(o) !== 0xff) return {};
    const marker = v.getUint8(o + 1);
    const len = v.getUint16(o + 2);
    // APP1 starting "Exif\0\0"
    if (marker === 0xe1 && v.getUint32(o + 4) === 0x45786966 && v.getUint16(o + 8) === 0) return readTiff(v, o + 10);
    if (marker === 0xda) return {};
    o += 2 + len;
  }
  return {};
}

function readTiff(v: DataView, t: number): PhotoInfo {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (p: number) => v.getUint16(p, le);
  const u32 = (p: number) => v.getUint32(p, le);
  if (u16(t + 2) !== 42) return {};

  const ifd = (start: number): Map<number, Value> => {
    const out = new Map<number, Value>();
    if (start <= 0 || t + start + 2 > v.byteLength) return out;
    const n = u16(t + start);
    for (let i = 0; i < n; i++) {
      const e = t + start + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      out.set(u16(e), value(e));
    }
    return out;
  };

  const value = (e: number): Value => {
    const type = u16(e + 2);
    const count = u32(e + 4);
    const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] ?? 0;
    if (!size) return undefined;
    const at = size * count <= 4 ? e + 8 : t + u32(e + 8);
    if (at + size * count > v.byteLength) return undefined;
    if (type === 2) {
      let s = '';
      for (let i = 0; i < count; i++) {
        const c = v.getUint8(at + i);
        if (!c) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }
    const nums: number[] = [];
    for (let i = 0; i < Math.min(count, 8); i++) {
      const p = at + i * size;
      if (type === 3) nums.push(u16(p));
      else if (type === 4) nums.push(u32(p));
      else if (type === 9) nums.push(v.getInt32(p, le));
      else if (type === 5) nums.push(u32(p) / (u32(p + 4) || 1));
      else if (type === 10) nums.push(v.getInt32(p, le) / (v.getInt32(p + 4, le) || 1));
      else nums.push(v.getUint8(p));
    }
    return count === 1 ? nums[0] : nums;
  };

  const ifd0 = ifd(u32(t + 4));
  const exif = ifd(Number(ifd0.get(TAGS.exifIfd)) || 0);
  const gps = ifd(Number(ifd0.get(TAGS.gpsIfd)) || 0);
  const str = (x: Value) => (typeof x === 'string' && x ? x : undefined);
  const num = (x: Value) => (typeof x === 'number' && isFinite(x) && x > 0 ? x : Array.isArray(x) && x[0] > 0 ? x[0] : undefined);

  const info: PhotoInfo = {
    make: str(ifd0.get(TAGS.make)),
    model: str(ifd0.get(TAGS.model)),
    lens: str(exif.get(TAGS.lens)),
    fNumber: num(exif.get(TAGS.fNumber)),
    exposure: num(exif.get(TAGS.exposure)),
    iso: num(exif.get(TAGS.iso)),
    focal: num(exif.get(TAGS.focal)),
  };
  // "YYYY:MM:DD HH:MM:SS", the camera's local time
  const d = str(exif.get(TAGS.dateOriginal))?.match(/^(\d{4}):(\d\d):(\d\d)[ T](\d\d):(\d\d)/);
  if (d && +d[1] > 1800) info.date = new Date(+d[1], +d[2] - 1, +d[3], +d[4], +d[5]);
  // GPS: refs at 1 and 3, degrees/minutes/seconds at 2 and 4
  const dms = (x: Value) => (Array.isArray(x) && x.length >= 3 ? x[0] + x[1] / 60 + x[2] / 3600 : undefined);
  const lat = dms(gps.get(2));
  const lon = dms(gps.get(4));
  if (lat !== undefined && lon !== undefined && !(lat === 0 && lon === 0)) {
    info.lat = gps.get(1) === 'S' ? -lat : lat;
    info.lon = gps.get(3) === 'W' ? -lon : lon;
  }
  for (const k of Object.keys(info) as (keyof PhotoInfo)[]) if (info[k] === undefined) delete info[k];
  return info;
}

export const hasInfo = (i: PhotoInfo | undefined) => !!i && Object.keys(i).length > 0;

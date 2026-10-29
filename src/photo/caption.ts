// Captions written from a photo's details, in two voices:
//   museum label   a wall label: place, date, then the camera, set out plainly
//   darkroom note  what a printer pencils on the back: terse, a Roman-numeral
//                  month, the exposure in shorthand
// These are only a starting point; they fill the caption once, when you ask,
// and after that the words are yours.

import type { PhotoInfo } from './exif';
import { coords, countryName, type Place } from './places';

export type CaptionStyle = 'label' | 'note';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const CORPORATE = /\b(corporation|corp\.?|co\.?,? ?ltd\.?|ltd\.?|inc\.?|imaging|optical|camera|company|electric|industrial)\b/gi;

/** "NIKON CORPORATION" + "NIKON D750" → "Nikon D750" */
export function cameraName(make?: string, model?: string) {
  const tidy = (s: string) => s.replace(CORPORATE, '').replace(/\s+/g, ' ').trim();
  const titled = (s: string) => (s === s.toUpperCase() && s.length > 3 ? s.replace(/\w+/g, (w) => (/\d/.test(w) ? w : w[0] + w.slice(1).toLowerCase())) : s);
  const mk = make ? titled(tidy(make)) : '';
  let md = model ? titled(tidy(model)) : '';
  if (mk && md.toLowerCase().startsWith(mk.toLowerCase())) md = md.slice(mk.length).trim();
  return [mk, md].filter(Boolean).join(' ');
}

export function placeName(p: Place | null, info: PhotoInfo) {
  if (info.lat === undefined || info.lon === undefined) return '';
  if (!p || p.km > 60) return coords(info.lat, info.lon);
  const where = `${p.name}, ${p.state ?? countryName(p.country)}`;
  return p.km > 8 ? `near ${where}` : where;
}

const shutter = (s: number) => (s >= 1 ? `${+s.toFixed(1)} s` : `1/${Math.round(1 / s)}`);
const aperture = (f: number) => `f/${+f.toFixed(1)}`;

function exposure(info: PhotoInfo, sep: string) {
  return [info.fNumber && aperture(info.fNumber), info.exposure && shutter(info.exposure) + (info.exposure < 1 && sep === ', ' ? ' s' : ''), info.iso && `ISO ${info.iso}`]
    .filter(Boolean)
    .join(sep);
}

function lensName(info: PhotoInfo) {
  if (info.lens) return info.lens;
  return info.focal ? `${Math.round(info.focal)}mm` : '';
}

/** A caption in the given voice, or '' when the photo has nothing to say. */
export function captionFor(info: PhotoInfo, place: Place | null, style: CaptionStyle): string {
  const where = placeName(place, info);
  const d = info.date;
  const camera = cameraName(info.make, info.model);
  const lens = lensName(info);
  if (style === 'label') {
    const lines = [
      where && where[0].toUpperCase() + where.slice(1),
      d && `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      [camera, lens].filter(Boolean).join(', '),
      exposure(info, ', '),
    ].filter(Boolean);
    return lines.join('\n');
  }
  const parts = [
    d && `${d.getDate()}.${ROMAN[d.getMonth()]}.${String(d.getFullYear()).slice(2)}`,
    where,
    [cameraName(undefined, info.model) || camera, info.focal ? `${Math.round(info.focal)}mm` : lens].filter(Boolean).join(' '),
    exposure(info, ' '),
  ].filter(Boolean);
  return parts.join('  ');
}

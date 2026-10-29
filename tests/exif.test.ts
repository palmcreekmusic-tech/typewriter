import { describe, expect, it } from 'vitest';
import citiesTsv from '../public/places/cities.tsv?raw';
import { readExif } from '../src/photo/exif';
import { nearest, parseTowns } from '../src/photo/places';
import { cameraName, captionFor } from '../src/photo/caption';
// @ts-expect-error plain JS dev helper
import { withExif } from '../scripts/dev/exif-jpeg.mjs';

const SOI_EOI = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const FM2 = { make: 'NIKON CORPORATION', model: 'NIKON FM2', lens: 'Nikkor 35mm f/2', date: '1987:06:14 18:42:00', fNumber: 8, exposure: 1 / 250, iso: 400, focal: 35, lat: 37.3636, lon: -118.3951 };
const towns = parseTowns(citiesTsv);

describe('photo details', () => {
  it('reads date, camera, exposure and place from a JPEG', () => {
    const jpeg: Uint8Array = withExif(SOI_EOI, FM2);
    const i = readExif(jpeg.buffer as ArrayBuffer);
    expect(i.make).toBe('NIKON CORPORATION');
    expect(i.model).toBe('NIKON FM2');
    expect(i.lens).toBe('Nikkor 35mm f/2');
    expect(i.fNumber).toBe(8);
    expect(i.exposure).toBeCloseTo(1 / 250);
    expect(i.iso).toBe(400);
    expect(i.focal).toBe(35);
    expect(i.date?.getFullYear()).toBe(1987);
    expect(i.date?.getMonth()).toBe(5);
    expect(i.lat).toBeCloseTo(37.3636, 3);
    expect(i.lon).toBeCloseTo(-118.3951, 3);
  });

  it('gives nothing for files without EXIF', () => {
    expect(readExif(SOI_EOI.buffer as ArrayBuffer)).toEqual({});
    expect(readExif(new Uint8Array([1, 2, 3]).buffer as ArrayBuffer)).toEqual({});
  });

  it('finds the nearest town offline', () => {
    const p = nearest(towns, 37.3636, -118.3951);
    expect(p?.name).toBe('Bishop');
    expect(p?.state).toBe('CA');
    expect(p!.km).toBeLessThan(5);
    expect(nearest(towns, 48.8584, 2.2945)?.name).toBe('Paris');
  });

  it('tidies camera names', () => {
    expect(cameraName('NIKON CORPORATION', 'NIKON D750')).toBe('Nikon D750');
    expect(cameraName('Canon', 'Canon EOS R5')).toBe('Canon EOS R5');
    expect(cameraName('FUJIFILM', 'X100V')).toBe('Fujifilm X100V');
    expect(cameraName('Apple', 'iPhone 15 Pro')).toBe('Apple iPhone 15 Pro');
  });

  it('writes a museum label and a darkroom note', () => {
    const info = readExif((withExif(SOI_EOI, FM2) as Uint8Array).buffer as ArrayBuffer);
    const place = nearest(towns, info.lat!, info.lon!);
    expect(captionFor(info, place, 'label')).toBe('Bishop, CA\n14 June 1987\nNikon FM2, Nikkor 35mm f/2\nf/8, 1/250 s, ISO 400');
    expect(captionFor(info, place, 'note')).toBe('14.VI.87  Bishop, CA  Nikon FM2 35mm  f/8 1/250 ISO 400');
  });

  it('far from any town, the place is coordinates', () => {
    const info = { lat: -54.5, lon: -30.2 };
    expect(captionFor(info, nearest(towns, info.lat, info.lon), 'label')).toBe('54.50° S, 30.20° W');
  });
});

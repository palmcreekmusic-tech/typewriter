// The photos you're captioning, one roll of them, kept in this browser
// (IndexedDB) so a reload brings them back. They never leave the device.

import { samplePhoto, type PhotoSource } from '../photo/print';
import { makeCanvas, ctx2d } from '../render/canvas';
import { readExif, type PhotoInfo } from '../photo/exif';

export interface Photo {
  source: PhotoSource;
  /** changes whenever the picture does, for caching the print */
  id: string;
  aspect: number;
  name: string;
  /** the stand-in, until you pick a photo */
  sample?: boolean;
  /** date, camera and place from its EXIF */
  info?: PhotoInfo;
}

const DB = 'typewriter';
const STORE = 'photos';
const MAX = 3000;

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export function sample(): Photo {
  const c = samplePhoto();
  return { source: c as PhotoSource, id: 'sample', aspect: c.width / c.height, name: 'Sample', sample: true };
}

/** One photo of a roll: the file, kept as picked, and what its EXIF says. */
export interface RollItem {
  blob: Blob;
  name: string;
  info?: PhotoInfo;
}

/** Stable across reloads, for keeping each photo's caption. */
export const itemKey = (it: RollItem) => `${it.name}|${it.blob.size}`;

async function infoOf(blob: Blob): Promise<PhotoInfo> {
  // EXIF sits at the very start of a JPEG
  try {
    return readExif(await blob.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    return {};
  }
}

/**
 * The picture itself, ready to draw. Only the photo on screen is decoded;
 * a whole roll of full-size bitmaps would run a phone out of memory.
 */
export async function decode(it: RollItem): Promise<Photo> {
  // the browser turns it the right way up from its EXIF orientation
  let bmp = await createImageBitmap(it.blob, { imageOrientation: 'from-image' });
  const long = Math.max(bmp.width, bmp.height);
  if (long > MAX) {
    const k = MAX / long;
    const c = makeCanvas(bmp.width * k, bmp.height * k);
    const x = ctx2d(c);
    x.imageSmoothingQuality = 'high';
    x.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    bmp = await createImageBitmap(c);
  }
  const info = it.info ?? (await infoOf(it.blob));
  return { source: bmp, id: `${itemKey(it)}|${bmp.width}x${bmp.height}`, aspect: bmp.width / bmp.height, name: it.name, info };
}

/** Opens the photos you picked as one roll and keeps them for next time. */
export async function openRoll(files: File[]): Promise<RollItem[]> {
  const items = await Promise.all(files.filter((f) => f.type.startsWith('image/')).map(async (f) => ({ blob: f as Blob, name: f.name, info: await infoOf(f) })));
  try {
    await put('roll', items.map(({ blob, name }) => ({ blob, name })));
  } catch {
    /* storage unavailable: they just won't come back after a reload */
  }
  return items;
}

/** The roll from last time, if there was one. */
export async function storedRoll(): Promise<RollItem[]> {
  try {
    const roll = (await get<RollItem[]>('roll')) ?? [];
    // before rolls there was one photo
    const one = roll.length ? null : await get<RollItem>('current');
    return Promise.all([...roll, ...(one ? [one] : [])].map(async (it) => ({ ...it, info: await infoOf(it.blob) })));
  } catch {
    return [];
  }
}

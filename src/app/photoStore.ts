// The photo you're captioning, kept in this browser (IndexedDB) so a reload
// brings it back. It's stored once, scaled to at most 3000 px on its long
// side, and never leaves the device.

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

async function decode(blob: Blob, name: string): Promise<Photo> {
  // the browser turns it the right way up from its EXIF orientation
  let bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
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
  // EXIF sits at the very start of a JPEG
  let info: PhotoInfo = {};
  try {
    info = readExif(await blob.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    /* unreadable details: the photo still works */
  }
  return { source: bmp, id: `${name}|${blob.size}|${bmp.width}x${bmp.height}`, aspect: bmp.width / bmp.height, name, info };
}

/** Opens a photo you picked and keeps it for next time. */
export async function openPhoto(file: File): Promise<Photo> {
  const p = await decode(file, file.name);
  try {
    await put('current', { blob: file, name: file.name });
  } catch {
    /* storage unavailable: it just won't come back after a reload */
  }
  return p;
}

/** The photo from last time, if there was one. */
export async function storedPhoto(): Promise<Photo | null> {
  try {
    const v = await get<{ blob: Blob; name: string }>('current');
    return v ? await decode(v.blob, v.name) : null;
  } catch {
    return null;
  }
}

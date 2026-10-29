// A roll: several photos captioned together. They share one machine,
// ribbon and typist, the way one person would caption a whole roll at one
// sitting, but each print gets its own seed, so the frames and the
// typing differ from photo to photo.

import { hash } from '../engine/rng';

/** The seed for frame i of a roll; the first frame keeps the roll's own seed. */
export function frameSeed(seed: number, i: number) {
  return i <= 0 ? seed : 1 + (hash(seed, 'roll-frame', i) % 99999);
}

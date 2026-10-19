// Seeded randomness. Everything random in the app comes from here, so a
// locked seed reproduces the exact same page on every device.

/** 32-bit FNV-1a hash of any mix of strings and numbers. */
export function hash(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = typeof part === 'number' ? part.toString(36) : part;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2c; // separator so ('ab','c') differs from ('a','bc')
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rng = () => number;

/** sfc32: small, fast, good-quality generator. Returns floats in [0, 1). */
export function sfc32(a: number, b: number, c: number, d: number): Rng {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * A generator for one named stream of the seed. Separate streams mean that
 * turning up one effect never reshuffles another.
 */
export function rngFor(seed: number, ...stream: (string | number)[]): Rng {
  const h = hash(seed, ...stream);
  const r = sfc32(h, h ^ 0x9e3779b9, h ^ 0x243f6a88, h ^ 0xb7e15162);
  for (let i = 0; i < 8; i++) r(); // warm up
  return r;
}

/** One deterministic float in [0, 1) for a key, without keeping a generator. */
export function rand01(seed: number, ...key: (string | number)[]): number {
  return rngFor(seed, ...key)();
}

/** Approximately normal, mean 0, sd 1. */
export function gauss(r: Rng): number {
  return (r() + r() + r() + r() + r() + r() - 3) * 1.4142;
}

export function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 9998);
}

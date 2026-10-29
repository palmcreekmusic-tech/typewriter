// What an export may be. The web app is the free demo: stills up to 1080 px
// on the long edge and video up to 15 seconds, with a small "typed with
// type[writer]" mark. The Mac and iPhone apps sell Pro, which lifts both and
// drops the mark; nothing is ever bought on the web.

export interface Tier {
  pro: boolean;
  /** long edge, px */
  maxStill: number;
  /** seconds */
  maxVideo: number;
  mark: boolean;
}

export const FREE: Tier = { pro: false, maxStill: 1080, maxVideo: 15, mark: true };
export const PRO: Tier = { pro: true, maxStill: 6000, maxVideo: 600, mark: false };

/** The native apps set this once the purchase is verified. */
export function currentTier(): Tier {
  const w = globalThis as { __TYPEWRITER_PRO__?: boolean };
  return w.__TYPEWRITER_PRO__ ? PRO : FREE;
}

/** Print resolution for a sheet, capped by the tier's long edge. */
export function stillPpi(widthIn: number, heightIn: number, tier: Tier, want = 300) {
  return Math.max(36, Math.min(want, tier.maxStill / Math.max(widthIn, heightIn)));
}

/** A file name from the first words typed. */
export function fileName(text: string, ext: string) {
  const words = text
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-')
    .toLowerCase()
    .slice(0, 40);
  return `${words || 'typewriter'}.${ext}`;
}

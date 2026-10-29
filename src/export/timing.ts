// How a type-on video is timed and framed. Kept apart from the encoder so
// the Save panel can show the length without loading it.

import type { Performance } from '../engine/performance';
import type { Tier } from './plan';

export type Aspect = '9:16' | '4:5' | '1:1' | '16:9';
export const ASPECTS: Record<Aspect, { w: number; h: number; label: string }> = {
  '9:16': { w: 1080, h: 1920, label: 'Story' },
  '4:5': { w: 1080, h: 1350, label: 'Portrait' },
  '1:1': { w: 1080, h: 1080, label: 'Square' },
  '16:9': { w: 1920, h: 1080, label: 'Wide' },
};

export const FPS = 30;
/** a beat of blank paper before the first key, and a look at the finished page */
export const LEAD = 0.6;
export const HOLD = 1.6;
/** never faster than this to fit a time limit; past it the video is cut */
const MAX_SPEEDUP = 4;

/** How long the video runs and how much the typing is sped up to fit. */
export function videoTiming(perfDuration: number, tier: Tier) {
  const natural = LEAD + perfDuration + HOLD;
  if (natural <= tier.maxVideo) return { speed: 1, duration: natural, cut: false };
  const speed = Math.min(MAX_SPEEDUP, perfDuration / (tier.maxVideo - LEAD - HOLD));
  const typed = perfDuration / speed;
  return { speed, duration: Math.min(tier.maxVideo, LEAD + typed + HOLD), cut: LEAD + typed + HOLD > tier.maxVideo };
}

/** The performance played faster: every beat comes sooner, the words never change. */
export function spedUp(perf: Performance, speed: number): Performance {
  if (speed === 1) return perf;
  return { duration: perf.duration / speed, beats: perf.beats.map((b) => ({ ...b, t: b.t / speed, dur: b.dur === undefined ? undefined : b.dur / speed })) };
}

/** Pixels per inch and how the sheet sits in a frame. */
export function framing(sheetW: number, sheetH: number, W: number, H: number) {
  // fill most of the width, but no closer than 3.5 inches of paper top to bottom,
  // and a sheet that's short enough sits whole in the frame
  const ppi = Math.floor(Math.min((W * 0.9) / sheetW, Math.max((H * 0.9) / sheetH, H / 3.5)));
  return { ppi, pans: sheetH * ppi > H * 0.94 };
}

/** Whether this browser can make see-through video (VP9 with alpha in WebM). */
export async function supportsInkOnly() {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    return !!(await VideoEncoder.isConfigSupported({ codec: 'vp09.00.40.08', width: 1080, height: 1920, bitrate: 6e6 })).supported;
  } catch {
    return false;
  }
}

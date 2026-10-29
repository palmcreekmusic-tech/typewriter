// The print's border, ported from Film Lab (E's film plugin). A photo can
// sit in the thin or full black of a negative carrier, a hand-filed carrier,
// or on a darkroom print with white paper around it.
//
// Every frame is "similar but different": the negative sits a little
// crooked in the carrier, the filed edge is rough with the odd tooth, the
// easel blades are never quite even. All of it comes from the seed, so a
// photo always gets the same frame. Distances are in inches, so the frame
// looks the same at any resolution.

import { rngFor, type Rng } from '../engine/rng';

export type Border = 'none' | 'thin' | 'full' | 'filed' | 'filedwhite' | 'print' | 'printclean';

/** paper tone, edge burn: a darkroom print */
export const PRINT_STYLES: Partial<Record<Border, true>> = { print: true, printclean: true };
/** white paper beyond the frame */
export const WHITE_OUT: Partial<Record<Border, true>> = { print: true, printclean: true, filedwhite: true };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

interface Profile {
  N: number;
  out: Float32Array;
}

/**
 * 1-D roughness along one side, sampled on t in [-0.1, 1.1]. Real carrier
 * edges are straight: what varies is fine filing roughness and the odd small
 * tooth where the file caught, nothing wavy.
 */
function edgeProfile(rng: Rng, amp: number, kind: 'filed' | 'gate', teeth?: { count: number; width: number; depth: number } | null): Profile {
  const N = 2048;
  const out = new Float32Array(N + 1);
  if (amp <= 0 && !teeth) return { N, out };
  const octs: [number, number][] = kind === 'filed' ? [[70, 0.3], [230, 0.35], [700, 0.35]] : [[3, 0.7], [9, 0.3]];
  const tabs = octs.map(([f]) => Float32Array.from({ length: f + 3 }, () => rng() * 2 - 1));
  const bumps: [number, number, number][] = [];
  for (let i = 0; i < (teeth ? teeth.count : 0); i++) bumps.push([0.04 + rng() * 0.92, teeth!.width * (0.5 + rng()), teeth!.depth * (0.5 + rng() * 0.8)]);
  for (let i = 0; i <= N; i++) {
    const t = -0.1 + (1.2 * i) / N;
    let v = 0;
    for (let o = 0; o < octs.length; o++) {
      const f = octs[o][0];
      const a = tabs[o];
      const x = ((t + 0.1) / 1.2) * f;
      const k = Math.floor(x);
      const u = x - k;
      const uu = u * u * (3 - 2 * u);
      v += octs[o][1] * (a[k] * (1 - uu) + a[k + 1] * uu);
    }
    v *= amp;
    // teeth: little black bumps standing out into the paper (negative = outward)
    for (const [c, w, d] of bumps) {
      const e = Math.abs(t - c) / w;
      if (e < 1) v -= d * (1 - e * e) * (1 - e * e);
    }
    out[i] = v;
  }
  return { N, out };
}

function edgeAt(p: Profile, t: number) {
  const x = ((t + 0.1) / 1.2) * p.N;
  if (x <= 0) return p.out[0];
  if (x >= p.N) return p.out[p.N];
  const k = x | 0;
  const u = x - k;
  return p.out[k] * (1 - u) + p.out[k + 1] * u;
}

export interface FrameGeom {
  border: Border;
  /** the short side, in inches; every size is a fraction of it */
  S: number;
  print: boolean;
  white: boolean;
  fullW: number;
  fullH: number;
  /** inner edge of the black, per side: left, right, top, bottom */
  gi: number[];
  gateInset: number;
  theta: number;
  cosT: number;
  sinT: number;
  ox: number;
  oy: number;
  radius: number;
  feather: number;
  gw: Profile[];
  outerKind: 'filed' | 'easel' | null;
  om: number[];
  phi: number;
  cosP: number;
  sinP: number;
  ow: Profile[];
  oFeather: number;
  oRadius: number;
  burnW: number;
  /** beyond this distance from every edge nothing changes */
  zone: number;
}

/**
 * Where the frame's edges fall on a fullW × fullH inch area.
 * vary: 0 = machined perfect, 1 = a typical hand-made print, 2 = a sloppy one.
 */
export function frameGeometry(border: Border, fullW: number, fullH: number, seed: number, vary = 1): FrameGeom {
  const S = Math.min(fullW, fullH);
  const L = Math.max(fullW, fullH);
  const v = clamp(vary, 0, 2);
  const vc = Math.min(1, v);
  const rng = rngFor(seed, 'frame');
  const R = () => rng() * 2 - 1;
  const kRough = Math.exp(R() * 0.6 * vc);
  const kTeeth = Math.exp(R() * 0.8 * vc);
  const kCorner = Math.exp(R() * 0.7 * vc);
  const kSoft = Math.exp(R() * 0.35 * vc);
  // gate = the camera's frame edge on the negative (inner edge of the black)
  // outer = filed carrier opening or easel blades (null = black to the edge)
  let gate: number;
  let outer: number | null = null;
  let outerKind: 'filed' | 'easel' | null = null;
  if (border === 'thin') gate = 0.014 * S;
  else if (border === 'full') gate = 0.045 * S;
  else if (border === 'filed') {
    outer = 0.02 * S;
    gate = outer + 0.016 * S;
    outerKind = 'filed';
  } else if (border === 'filedwhite') {
    outer = 0.035 * S;
    gate = outer + 0.011 * S;
    outerKind = 'filed';
  } else if (border === 'print') {
    outer = 0.065 * S;
    gate = outer + 0.012 * S;
    outerKind = 'filed';
  } else {
    outer = 0.065 * S;
    gate = outer;
    outerKind = 'easel';
  }
  // outer edge per side (filed opening / easel blades never quite even)
  const om = [0, 0, 0, 0];
  if (outer !== null) {
    const unevenness = outerKind === 'easel' ? 0.3 : 0.18;
    for (let k = 0; k < 4; k++) om[k] = outer * (1 + R() * vc * unevenness);
  }
  // black band per side: the negative never sits centred in the carrier
  const band = gate - (outer || 0);
  const gi = [0, 1, 2, 3].map((k) => (outerKind === 'easel' ? om[k] : outer === null ? gate * (1 + R() * 0.35 * v) : om[k] + band * Math.max(0.15, 1 + R() * 0.6 * v)));
  const gateInset = Math.min(...gi);
  // …and it sits crooked and off-centre
  let theta = R() * v * 0.01;
  let ox = R() * v * 0.009 * S;
  let oy = R() * v * 0.007 * S;
  if (outerKind === 'easel') {
    theta *= 0.6;
    ox *= 0.3;
    oy *= 0.3;
  }
  const minBand = Math.min(...gi.map((x, k) => x - om[k]));
  const room = outer === null ? 0.85 * gateInset : outerKind === 'easel' ? 0.6 * gateInset : 0.85 * minBand + (border === 'filed' ? 0.5 * outer! : 0);
  const need = (Math.abs(theta) * L) / 2 + Math.max(Math.abs(ox), Math.abs(oy));
  if (need > room && need > 0) {
    const k = room / need;
    theta *= k;
    ox *= k;
    oy *= k;
  }
  // the camera gate: machined straight, corners barely rounded, edge a touch soft
  const radius = 0.0025 * S * kCorner;
  const feather = (border === 'printclean' ? 0.0005 : 0.0009) * S * kSoft;
  const gw = [0, 1, 2, 3].map(() => edgeProfile(rng, outerKind === 'easel' ? 0 : 0.00025 * S * (0.5 + v), 'gate'));
  let phi = 0;
  let ow: Profile[] = [];
  let oFeather = 0;
  let oRadius = 0;
  if (outer !== null) {
    phi = R() * v * (outerKind === 'easel' ? 0.004 : 0.002);
    const rough = (outerKind === 'filed' ? (0.2 + v) * 0.0007 * S : 0.00015 * S * (0.5 + v)) * kRough;
    ow = [0, 1, 2, 3].map((k) => {
      const teeth =
        outerKind === 'filed' && v > 0
          ? { count: (Math.floor(rng() * (1 + 3.5 * v) * kTeeth) * (k >= 2 ? 1 : 0.5)) | 0, width: 0.006, depth: (0.4 + vc) * 0.0018 * S * (0.6 + 0.4 * v) }
          : null;
      return edgeProfile(rng, rough, outerKind === 'filed' ? 'filed' : 'gate', teeth);
    });
    oFeather = (outerKind === 'filed' ? 0.0004 : 0.0006) * S * Math.sqrt(kSoft);
    oRadius = outerKind === 'filed' ? 0.0035 * S * kCorner : 0;
  }
  const print = !!PRINT_STYLES[border];
  const burnW = print ? 0.08 * S : 0;
  const zone = Math.max(...gi, outer || 0) * 1.35 + Math.abs(theta) * L * 0.6 + Math.abs(ox) + Math.abs(oy) + 0.02 * S + burnW;
  return {
    border,
    S,
    print,
    white: !!WHITE_OUT[border],
    fullW,
    fullH,
    gi,
    gateInset,
    theta,
    cosT: Math.cos(theta),
    sinT: Math.sin(theta),
    ox,
    oy,
    radius,
    feather,
    gw,
    outerKind,
    om,
    phi,
    cosP: Math.cos(phi),
    sinP: Math.sin(phi),
    ow,
    oFeather,
    oRadius,
    burnW,
    zone,
  };
}

/**
 * How much to add around a photo so the frame's black edge sits just outside
 * it: your photo is the whole exposed frame, so the border goes around it,
 * not over it.
 */
export function framePad(border: Border, w: number, h: number, seed: number, vary = 1) {
  if (border === 'none') return 0;
  let e = 0;
  for (let i = 0; i < 5; i++) {
    const W = w + 2 * e;
    const H = h + 2 * e;
    const g = frameGeometry(border, W, H, seed, vary);
    const need = (Math.abs(g.theta) * Math.max(W, H)) / 2 + Math.max(Math.abs(g.ox), Math.abs(g.oy)) + 0.002 * g.S;
    e = Math.max(0, g.gateInset - need);
  }
  return e;
}

function roundedDist(a: number, b: number, r: number) {
  if (a < r && b < r) return r - Math.hypot(r - a, r - b);
  return Math.min(a, b);
}

/** Signed distances (positive inside) to the gate and to the carrier opening or easel. */
export function frameDistances(g: FrameGeom, X: number, Y: number) {
  const cx = g.fullW / 2;
  const cy = g.fullH / 2;
  let dx = X - cx - g.ox;
  let dy = Y - cy - g.oy;
  let u = g.cosT * dx + g.sinT * dy;
  let w = -g.sinT * dx + g.cosT * dy;
  const gi = g.gi;
  const tu = (u + cx) / g.fullW;
  const tw = (w + cy) / g.fullH;
  const a = Math.min(u + cx - gi[0] - edgeAt(g.gw[0], tw), cx - gi[1] - u - edgeAt(g.gw[1], tw));
  const b = Math.min(w + cy - gi[2] - edgeAt(g.gw[2], tu), cy - gi[3] - w - edgeAt(g.gw[3], tu));
  const dGate = roundedDist(a, b, g.radius);
  if (!g.outerKind) return { dGate, dOuter: 1e9, u, w };
  dx = X - cx;
  dy = Y - cy;
  const pu0 = g.cosP * dx + g.sinP * dy;
  const pw0 = -g.sinP * dx + g.cosP * dy;
  const pu = (pu0 + cx) / g.fullW;
  const pw = (pw0 + cy) / g.fullH;
  const oa = Math.min(pu0 + cx - g.om[0] - edgeAt(g.ow[0], pw), cx - g.om[1] - pu0 - edgeAt(g.ow[1], pw));
  const ob = Math.min(pw0 + cy - g.om[2] - edgeAt(g.ow[2], pu), cy - g.om[3] - pw0 - edgeAt(g.ow[3], pu));
  return { dGate, dOuter: g.oRadius ? roundedDist(oa, ob, g.oRadius) : Math.min(oa, ob), u, w };
}

// 5×7 pixel font for the maker's edge printing (frame numbers, arrows, speed code)
const GLYPHS: Record<string, string> = {
  '0': '01110100011001110101110011000101110',
  '1': '00100011000010000100001000010001110',
  '2': '01110100010000100010001000100011111',
  '3': '11110000010000101110000010000111110',
  '4': '00010001100101010010111110001000010',
  '5': '11111100001111000001000011000101110',
  '6': '00110010001000011110100011000101110',
  '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110',
  '9': '01110100011000101111000010001001100',
  A: '01110100011000111111100011000110001',
  '-': '00000000000000011111000000000000000',
  '>': '10000110001110011110111001100010000',
  ' ': '00000000000000000000000000000000000',
};

export interface EdgeText {
  side: 2 | 3;
  h: number;
  gap: number;
  items: [number, string][];
  shift: number;
}

/** 35 mm edge printing: frame numbers, the arrow and the speed code, pre-exposed by the maker. */
export function edgeTextLayout(g: FrameGeom, seed: number): EdgeText | null {
  // only where there's film rebate wide enough to carry it
  if (g.border !== 'full' && g.border !== 'filed') return null;
  const mm = g.S / 24;
  const rng = rngFor(seed, 'edge-print');
  const n = 1 + Math.floor(rng() * 36);
  const items: [number, string][] = [
    [0.12, String(n)],
    [0.36, '>' + n + 'A'],
    [0.6, '400-' + (1 + Math.floor(rng() * 8))],
    [0.86, String(n + 1)],
  ];
  // keep it inside the film's own black, clear of the paper edge or the carrier;
  // it's on one edge of the film, the other if that one's cropped too tight
  const land = g.fullW >= g.fullH;
  const roomOn = (side: 2 | 3) => {
    const k = side === 2 ? (land ? 2 : 0) : land ? 3 : 1;
    return g.gi[k] - g.om[k] - Math.max(Math.abs(g.ox), Math.abs(g.oy)) - Math.abs(g.theta) * Math.max(g.fullW, g.fullH) * 0.4;
  };
  let side: 2 | 3 = rng() < 0.5 ? 2 : 3;
  if (roomOn(side) < 0.6 * mm) side = side === 2 ? 3 : 2;
  const room = roomOn(side);
  let gap = 0.12 * mm + 0.3 * mm * rng();
  gap = Math.min(gap, room * 0.2);
  const h = Math.min(0.62 * mm, (room - gap) * 0.85);
  if (h < 0.3 * mm) return null;
  return { side, h, gap, items, shift: (rng() - 0.5) * 0.08 };
}

/** 0..1 coverage of the edge printing at (u, w), the negative's own frame with origin at its centre. */
export function edgeTextAt(T: EdgeText, g: FrameGeom, u: number, w: number) {
  // the printing runs along the film's long side, whichever way the photo is turned
  const land = g.fullW >= g.fullH;
  const along = land ? u : w;
  const across = land ? w : u;
  const hA = (land ? g.fullW : g.fullH) / 2;
  const hC = (land ? g.fullH : g.fullW) / 2;
  const e0 = land ? g.gi[0] : g.gi[2];
  const e1 = land ? g.gi[1] : g.gi[3];
  const sA = land ? g.gi[2] : g.gi[0];
  const sB = land ? g.gi[3] : g.gi[1];
  const near = T.side === 2 ? -(hC - sA) : hC - sB;
  const dirOut = T.side === 2 ? -1 : 1;
  const top = near + dirOut * T.gap;
  const rel = (across - top) * dirOut;
  if (rel < 0 || rel > T.h) return 0;
  const span = 2 * hA - e0 - e1;
  const ch = T.h / 7;
  const cw = ch * 1.15;
  for (const [pos, str] of T.items) {
    const x0 = -hA + e0 + (pos + T.shift) * span;
    const lx = along - x0;
    if (lx < 0 || lx > str.length * cw * 6) continue;
    const ci = Math.floor(lx / (cw * 6));
    const gx = (lx - ci * cw * 6) / cw;
    const gy = (T.side === 2 ? T.h - rel : rel) / ch;
    const gl = GLYPHS[str[ci]] || GLYPHS[' '];
    if (gx < -0.5 || gx > 5.5 || gy < -0.5 || gy > 7.5) return 0;
    // the maker's printing is a soft contact exposure, not crisp pixels
    const bit = (i: number, j: number) => (i < 0 || i > 4 || j < 0 || j > 6 ? 0 : gl[j * 5 + i] === '1' ? 1 : 0);
    const fx = gx - 0.5;
    const fy = gy - 0.5;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const tx = fx - i0;
    const ty = fy - j0;
    const val = (bit(i0, j0) * (1 - tx) + bit(i0 + 1, j0) * tx) * (1 - ty) + (bit(i0, j0 + 1) * (1 - tx) + bit(i0 + 1, j0 + 1) * tx) * ty;
    return smoothstep(0.25, 0.75, val);
  }
  return 0;
}

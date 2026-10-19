// Turns the perfect layout plus the flaw amounts into one "strike" per
// character: exactly how hard, where, and how cleanly each key hit the page.
// Everything is seeded so a locked seed gives the same page every time.
//
// Three kinds of randomness, each with its own stream:
//  - machine: belongs to the type slug, so the same letter is always off
//    the same way (keyed by character only)
//  - line: the typist's carriage return and paper feed (keyed by page/row)
//  - strike: each key press (keyed by the nth occurrence of that letter, so
//    editing one word doesn't reshuffle the whole page)

import type { Layout } from './layout';
import type { MachineStyle, RibbonKind } from './types';
import { rngFor, gauss, type Rng } from './rng';
import { FILLABLE, PINKY, PUNCH, type FlawAmounts } from './flaws';
import { quirksFor, type Quirk } from './quirks';

export interface Strike {
  /** index into layout.cells */
  cell: number;
  variant: number;
  /** offsets from the perfect position, inches */
  dx: number;
  dy: number;
  rot: number;
  /** 0..1 ink coverage */
  alpha: number;
  /** extra stroke around the glyph, inches (ink spread / heavy strike) */
  spread: number;
  /** ink density multipliers at the top and bottom of the letter */
  top: number;
  bottom: number;
  /** 0..1 how far the counters are clogged */
  fill: number;
  /** a second, offset impression */
  double?: { dx: number; dy: number; alpha: number };
  /** ink blots and splatter dots, positions relative to the glyph center, inches */
  blots: { x: number; y: number; r: number; a: number }[];
  /** a broken-off piece of the slug: center and radius in em, from the baseline center */
  chip?: { x: number; y: number; r: number };
}

export interface PageFlaws {
  /** radians: the sheet went into the machine crooked */
  tilt: number;
}

export interface StrikeContext {
  layout: Layout;
  amounts: FlawAmounts;
  seed: number;
  variants: number;
  machine: MachineStyle;
  ribbon: RibbonKind;
  /** base spread from the typeface, inches */
  fontSpread: number;
  /** this machine's damaged keys */
  quirks?: Quirk[];
}

const IN = 1; // all distances below are in inches

/** Ink coverage for a ribbon from dry (0) through healthy (0.5) to soaked (1). */
export function inkCoverage(ink: number, ribbon: RibbonKind): number {
  if (ribbon === 'film') return 0.9 + 0.1 * ink;
  const c = ink < 0.5 ? 0.38 + (ink / 0.5) * 0.54 : 0.92 + (ink - 0.5) * 0.16;
  return ribbon === 'carbon' ? c * 0.88 : c;
}

export function pageFlaws(seed: number, page: number, a: FlawAmounts): PageFlaws {
  const r = rngFor(seed, 'page', page);
  const deg = gauss(r) * 0.55 * a.tilt + (r() - 0.5) * 0.4 * a.tilt;
  return { tilt: (deg * Math.PI) / 180 };
}

interface MachineGlyph {
  dx: number;
  dy: number;
  rot: number;
  /** -1 bottom heavy .. 1 top heavy */
  feet: number;
  fill: number;
  /** which way a leaning slug leans, and where a chipped one is broken */
  lean: number;
  chip: { x: number; y: number };
}

function machineGlyph(seed: number, ch: string, a: FlawAmounts): MachineGlyph {
  const r = rngFor(seed, 'machine', ch);
  const m = a.misalign;
  // most slugs are a hair off; a few are clearly bent
  const bent = r() < 0.12 * m ? 1 : 0;
  const dy = (gauss(r) * 0.0035 + bent * (r() < 0.5 ? -1 : 1) * (0.008 + 0.01 * r())) * m * IN;
  const dx = (gauss(r) * 0.0025 + bent * (r() - 0.5) * 0.01) * m * IN;
  const rot = (gauss(r) * 0.012 + bent * (r() - 0.5) * 0.06) * m;
  const feet = Math.max(-1, Math.min(1, gauss(r) * 0.5)) * m;
  const fill = FILLABLE.has(ch) && r() < a.filled * 0.85 ? (0.35 + 0.65 * r()) * Math.min(1, a.filled * 1.4) : 0;
  const lean = r() < 0.5 ? -1 : 1;
  const ang = r() * Math.PI * 2;
  const chip = { x: Math.cos(ang) * 0.22, y: -0.32 + Math.sin(ang) * 0.3 };
  return { dx, dy, rot, feet, fill, lean, chip };
}

export function computeStrikes(ctx: StrikeContext): Strike[] {
  const { layout, amounts: a, seed } = ctx;
  const cells = layout.cells;
  const electric = ctx.machine === 'selectric' || ctx.machine === 'electronic';
  const coverage = inkCoverage(a.ink, ctx.ribbon);
  const capsShift = (rngFor(seed, 'caps')() - 0.35) * 0.03 * a.caps * IN;
  const streakPhase = rngFor(seed, 'streak')() * Math.PI * 2;

  const machine = new Map<string, MachineGlyph>();
  const lines = new Map<string, { dy: number; slope: number }>();
  const seen = new Map<string, number>();
  const quirkScale = 2 * a.quirks;
  const quirkCache = new Map<string, ReturnType<typeof quirksFor>>();

  return cells.map((c, i) => {
    let mg = machine.get(c.ch);
    if (!mg) machine.set(c.ch, (mg = machineGlyph(seed, c.ch, a)));

    const lineKey = `${c.page}:${c.row}`;
    let line = lines.get(lineKey);
    if (!line) {
      const lr = rngFor(seed, 'line', lineKey);
      line = { dy: gauss(lr) * 0.005 * a.baseline * IN, slope: gauss(lr) * 0.0012 * a.baseline };
      lines.set(lineKey, line);
    }

    const n = seen.get(c.ch) ?? 0;
    seen.set(c.ch, n + 1);
    const r: Rng = rngFor(seed, 'strike', c.ch, n);
    const variant = Math.floor(r() * ctx.variants);

    // How hard the key went down.
    const finger = PINKY.has(c.ch.toLowerCase()) ? 0.22 : 0;
    const punch = PUNCH.has(c.ch) ? 0.25 : 0;
    const jitter = r();
    const strength = Math.max(0.32, 1 - a.pressure * (0.42 * jitter * jitter + finger) + a.pressure * punch);

    // The ribbon gives out the more you type (by count, so typing more
    // never changes letters already on the page).
    const progress = Math.min(1, i / 1500);
    const fade = 1 - a.fade * 0.5 * progress - a.fade * 0.12 * r();

    const alpha = Math.max(0.08, Math.min(1, coverage * strength * fade + (electric ? 0.04 : 0)));

    // Ribbon streaks: a worn band of the ribbon crosses the top or bottom of the letters.
    const wave = Math.sin(i * 0.045 + streakPhase) + 0.6 * Math.sin(i * 0.13 + streakPhase * 2);
    const streak = a.streaks * Math.max(0, Math.abs(wave) - 0.5) * 0.9;
    let top = 1 - (wave > 0 ? streak : 0);
    let bottom = 1 - (wave < 0 ? streak : 0);
    // A slug that doesn't strike flat prints heavier on one edge.
    if (mg.feet > 0) bottom *= 1 - mg.feet * 0.6;
    else top *= 1 + mg.feet * 0.6;

    const x = layout.originX + c.col * layout.cellW;
    let dy = mg.dy + line.dy + line.slope * x + gauss(r) * 0.0028 * a.baseline * IN;
    if (c.ch !== c.ch.toLowerCase()) dy += capsShift;
    const dx = mg.dx + gauss(r) * 0.0016 * a.baseline * IN;
    const rot = mg.rot + gauss(r) * 0.006 * a.baseline;

    const heavy = Math.max(0, a.ink - 0.5) * 2;
    const spread = ctx.fontSpread + (0.0012 * heavy + 0.004 * a.overink * strength * r()) * IN;

    let double: Strike['double'];
    const dr = r();
    if (dr < a.double * 0.14) {
      // a bounced key: a full second impression
      const dir = r() < 0.5 ? -1 : 1;
      double = { dx: dir * (0.012 + 0.02 * r()), dy: (r() - 0.5) * 0.01, alpha: alpha * (0.5 + 0.4 * r()) };
    } else if (dr < a.double * 0.4) {
      // the typebar rebounding and kissing the ribbon again: a faint ghost
      double = { dx: (r() < 0.5 ? -1 : 1) * (0.005 + 0.008 * r()), dy: (r() - 0.5) * 0.006, alpha: alpha * (0.18 + 0.2 * r()) };
    }

    const blots: Strike['blots'] = [];
    const blotChance = a.overink * (0.15 + 0.35 * heavy) * strength;
    if (r() < blotChance && c.ch.trim()) {
      // a blob is a few overlapping drops hanging off one edge of the letter,
      // so it reads as a separate lump of ink rather than a bolder glyph
      const side = r() < 0.5 ? -1 : 1;
      const bx = side * (0.022 + r() * 0.022);
      const by = -0.012 - r() * 0.06;
      const size = 0.014 + r() * 0.02 * (0.6 + a.overink);
      const drops = 2 + Math.floor(r() * 3);
      for (let d = 0; d < drops; d++) {
        blots.push({ x: bx + side * r() * size * 1.2, y: by + (r() - 0.5) * size * 1.4, r: size * (0.45 + 0.55 * r()), a: 0.7 + 0.3 * r() });
      }
    }
    const splats = poisson(a.splatter * 0.9 * strength * (0.6 + heavy), r);
    for (let k = 0; k < splats; k++) {
      const ang = r() * Math.PI * 2;
      const dist = 0.02 + r() * r() * 0.11;
      blots.push({ x: Math.cos(ang) * dist, y: -0.035 + Math.sin(ang) * dist * 0.8, r: 0.0035 + r() * r() * 0.01, a: 0.7 + 0.3 * r() });
    }

    // This machine's own damaged keys.
    const k = quirkCache.get(c.ch) ?? quirkCache.set(c.ch, quirksFor(ctx.quirks ?? [], c.ch, quirkScale)).get(c.ch)!;
    let qAlpha = alpha;
    let qDy = dy;
    let qRot = rot;
    let fill = mg.fill;
    let qSpread = spread;
    let chip: Strike['chip'];
    if (k.faint) qAlpha *= 1 - 0.75 * Math.min(1, k.faint);
    if (k.heavy) {
      qAlpha = Math.min(1, qAlpha * (1 + 0.5 * k.heavy));
      qSpread += 0.004 * k.heavy * IN;
      if (r() < 0.3 * k.heavy && c.ch.trim()) blots.push({ x: mg.lean * 0.03, y: -0.03, r: 0.012 + 0.012 * k.heavy, a: 0.85 });
    }
    if (k.topfade) top *= 1 - 0.92 * Math.min(1, k.topfade);
    if (k.high) qDy -= 0.02 * k.high * IN;
    if (k.low) qDy += 0.02 * k.low * IN;
    if (k.crooked) qRot += mg.lean * 0.13 * k.crooked;
    if (k.clogged) fill = Math.max(fill, Math.min(1, 0.3 + 0.45 * k.clogged));
    if (k.chipped) chip = { ...mg.chip, r: 0.1 + 0.16 * Math.min(1.2, k.chipped) };
    if (k.sticky && !double && r() < 0.65 * Math.min(1, k.sticky)) {
      double = { dx: mg.lean * (0.01 + 0.012 * r()), dy: (r() - 0.5) * 0.006, alpha: qAlpha * (0.55 + 0.35 * r()) };
    }

    return { cell: i, variant, dx, dy: qDy, rot: qRot, alpha: Math.max(0.05, qAlpha), spread: qSpread, top, bottom, fill, double, blots, chip };
  });
}

function poisson(lambda: number, r: Rng): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L && k < 12);
  return k - 1;
}

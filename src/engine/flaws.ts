// The flaw layer: how far the page drifts from perfect.
//
// Two big sliders drive every flaw along its own curve: Typist ("Pro" to
// "First timer") moves the typist's flaws, Machine ("Just serviced" to "Attic
// find") moves the machine's, its ribbon's and the paper grain. Keeping them
// apart is the coherence rule: a skilled typist on a tired machine reads
// differently from a nervous one on a good machine. Each flaw slider in the
// drawer is stored as an offset from its curve, so you can tweak one flaw and
// still move the big sliders afterwards.
//
// Realistic mode keeps the page to what a real machine, ribbon and typist
// could do (see research/typewriter-mechanics-and-paper.md):
//  - every flaw has a ceiling, so the far end is a tired machine and a
//    clumsy typist, not noise over a font
//  - the machine's design rules some flaws out: a Selectric's one typeball
//    can't have a single bent letter, a daisywheel can't bounce
// Artistic mode lifts the ceilings and the rules, so anything can go to 11.

import type { MachineStyle } from './types';

export type FlawKey =
  | 'pressure'
  | 'overink'
  | 'splatter'
  | 'bleed'
  | 'fade'
  | 'streaks'
  | 'baseline'
  | 'tilt'
  | 'misalign'
  | 'filled'
  | 'double'
  | 'caps'
  | 'grain'
  | 'quirks'
  | 'typos'
  | 'spacing'
  | 'twotone'
  | 'stains'
  | 'folds'
  | 'trail'
  | 'lift';

export interface Flaws {
  /** 0 = pro typist, 1 = first timer */
  typist: number;
  /** 0 = just serviced, 1 = attic find: the machine, its ribbon and the paper's grain */
  machine: number;
  /** 0 = nearly dry ribbon, 0.5 = healthy, 1 = soaked */
  ink: number;
  offsets: Partial<Record<FlawKey, number>>;
}

/** How the type reaches the paper. */
export type Mechanism = 'typebar' | 'typeball' | 'daisywheel';

export function mechanism(m: MachineStyle): Mechanism {
  return m === 'selectric' ? 'typeball' : m === 'electronic' ? 'daisywheel' : 'typebar';
}

export interface FlawInfo {
  key: FlawKey;
  label: string;
  group: 'Ink' | 'Typist' | 'Machine' | 'Paper';
  /** the amount at slider position t (the Typist slider for typist flaws, Machine for the rest) */
  curve: (t: number) => number;
  /** realistic mode: the slider's full travel reaches this much */
  real: number;
  /** machines that can't do this at all in realistic mode, and why */
  cant?: Partial<Record<Mechanism, string>>;
}

const BALL = 'One typeball carries every letter, so letters can\'t go wrong one at a time.';
const DAISY = 'The petals sit on one wheel and a motor strikes them evenly.';
const MOTOR = 'A motor strikes every key with the same force.';

export const FLAWS: FlawInfo[] = [
  { key: 'overink', label: 'Too much ink, blotting', group: 'Ink', curve: (t) => 0.7 * t ** 1.6, real: 0.5 },
  { key: 'splatter', label: 'Ink splatter', group: 'Ink', curve: (t) => 0.75 * t ** 2.2, real: 0.3, cant: { daisywheel: DAISY } },
  { key: 'bleed', label: 'Ink bleed into paper', group: 'Ink', curve: (t) => 0.12 + 0.4 * t ** 1.3, real: 0.75 },
  { key: 'fade', label: 'Ribbon fade', group: 'Ink', curve: (t) => 0.08 + 0.5 * t, real: 0.8 },
  { key: 'streaks', label: 'Ribbon streaks', group: 'Ink', curve: (t) => 0.55 * t ** 1.6, real: 0.55 },
  { key: 'lift', label: 'Ribbon riding high (cut-off bottoms)', group: 'Ink', curve: () => 0, real: 0.6 },
  { key: 'twotone', label: 'Second colour creeping in', group: 'Ink', curve: (t) => 0.2 + 0.5 * t, real: 0.6, cant: { typeball: BALL, daisywheel: DAISY } },
  { key: 'pressure', label: 'Uneven key pressure', group: 'Typist', curve: (t) => 0.1 + 0.9 * t, real: 0.85, cant: { typeball: MOTOR, daisywheel: MOTOR } },
  { key: 'baseline', label: 'Baseline jitter', group: 'Typist', curve: (t) => 0.04 + 0.96 * t ** 1.7, real: 0.5 },
  { key: 'typos', label: 'Typos (fixed with your correction style)', group: 'Typist', curve: (t) => 0.04 + 0.7 * t ** 1.3, real: 0.45 },
  { key: 'tilt', label: 'Crooked paper', group: 'Typist', curve: (t) => 0.8 * t ** 2, real: 0.5 },
  { key: 'double', label: 'Double strikes', group: 'Typist', curve: (t) => 0.9 * t ** 1.8, real: 0.35, cant: { typeball: BALL, daisywheel: DAISY } },
  { key: 'misalign', label: 'Misaligned letters', group: 'Machine', curve: (t) => 0.06 + 0.8 * t, real: 0.8, cant: { typeball: BALL } },
  { key: 'filled', label: 'Filled-in letters', group: 'Machine', curve: (t) => 0.8 * t ** 1.3, real: 0.8 },
  { key: 'quirks', label: 'Key quirks', group: 'Machine', curve: (t) => 0.3 + 0.45 * t, real: 0.85 },
  { key: 'caps', label: 'Capitals out of line', group: 'Machine', curve: (t) => 0.9 * t ** 1.5, real: 0.8, cant: { typeball: 'The ball turns for capitals instead of shifting.', daisywheel: 'Capitals are separate petals on the wheel.' } },
  { key: 'spacing', label: 'Uneven spacing', group: 'Machine', curve: (t) => 0.05 + 0.75 * t ** 1.5, real: 0.45, cant: { daisywheel: 'A motor steps the carriage exactly.' } },
  { key: 'trail', label: 'Ghost after words', group: 'Machine', curve: () => 0, real: 0.8, cant: { typeball: BALL, daisywheel: DAISY } },
  { key: 'grain', label: 'Paper grain', group: 'Paper', curve: (t) => 0.5 + 0.3 * t, real: 1 },
  // stains and folds are what happened to the page, not how it was typed:
  // the big sliders leave them alone
  { key: 'stains', label: 'Coffee stains', group: 'Paper', curve: () => 0, real: 1 },
  { key: 'folds', label: 'Folded', group: 'Paper', curve: () => 0, real: 1 },
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Where the two big sliders sit. */
export type Levels = Pick<Flaws, 'typist' | 'machine'>;

/** Which big slider drives a flaw. */
export function sliderOf(info: FlawInfo): keyof Levels {
  return info.group === 'Typist' ? 'typist' : 'machine';
}

/** The curve value before your offset, for one flaw. */
export function baseAmount(info: FlawInfo, levels: Levels, _machine?: MachineStyle): number {
  return clamp01(info.curve(clamp01(levels[sliderOf(info)])));
}

/** Both big sliders at one position, for a quick single-level look. */
export const both = (t: number): Levels => ({ typist: t, machine: t });

export type FlawAmounts = Record<FlawKey, number> & { ink: number };

/** Where each slider sits, 0..1. This is what the controls show. */
export function resolveFlaws(f: Flaws, machine: MachineStyle): FlawAmounts {
  const out = { ink: clamp01(f.ink) } as FlawAmounts;
  for (const info of FLAWS) out[info.key] = clamp01(baseAmount(info, f, machine) + (f.offsets[info.key] ?? 0));
  return out;
}

/** Why this machine can't do a flaw in realistic mode, if it can't. */
export function cantDo(key: FlawKey, machine: MachineStyle): string | undefined {
  return FLAWS.find((x) => x.key === key)?.cant?.[mechanism(machine)];
}

/**
 * How much of each flaw actually reaches the page. Realistic mode scales
 * each slider to its ceiling and drops what the machine can't do; artistic
 * mode uses the sliders as they are.
 */
export function effectiveFlaws(f: Flaws, machine: MachineStyle, artistic = false): FlawAmounts {
  const out = resolveFlaws(f, machine);
  if (artistic) return out;
  const mech = mechanism(machine);
  for (const info of FLAWS) out[info.key] = info.cant?.[mech] ? 0 : out[info.key] * info.real;
  return out;
}

/** Sets one flaw to an absolute amount by storing the offset from its curve. */
export function setFlaw(f: Flaws, key: FlawKey, amount: number, machine: MachineStyle): Flaws {
  const info = FLAWS.find((x) => x.key === key)!;
  const offset = clamp01(amount) - baseAmount(info, f, machine);
  const offsets = { ...f.offsets, [key]: Math.abs(offset) < 0.005 ? undefined : offset };
  return { ...f, offsets };
}

export function isTweaked(f: Flaws): boolean {
  return Object.values(f.offsets).some((v) => v !== undefined && Math.abs(v) >= 0.005);
}

/** Letters typed with the weak little fingers on QWERTY, which print lighter. */
export const PINKY = new Set('aqzp;:/?\'"[]-=0'.split(''));
/** Small, sharply struck marks that hit harder than letters. */
export const PUNCH = new Set('.,:;\''.split(''));
/** Letters whose enclosed counters fill with dried ink. */
export const FILLABLE = new Set('aeobdpqg6890ABDOPQR&@%'.split(''));

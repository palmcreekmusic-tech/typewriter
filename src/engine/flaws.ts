// The flaw layer: how far the page drifts from perfect.
//
// One master slider ("Pro typist" to "First timer") drives every flaw along
// its own curve. Each flaw slider in the drawer is stored as an offset from
// that curve, so you can tweak one flaw and still move the master afterwards.
// Electric machines are mechanically even, so typist and machine wobble is
// scaled down for them.

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
  | 'folds';

export interface Flaws {
  /** 0 = pro typist, 1 = first timer */
  master: number;
  /** 0 = nearly dry ribbon, 0.5 = healthy, 1 = soaked */
  ink: number;
  offsets: Partial<Record<FlawKey, number>>;
}

export interface FlawInfo {
  key: FlawKey;
  label: string;
  group: 'Ink' | 'Typist' | 'Machine' | 'Paper';
  /** the master curve: amount at master t */
  curve: (t: number) => number;
  /** typist or machine wobble that electric machines don't have */
  mechanical?: boolean;
}

export const FLAWS: FlawInfo[] = [
  { key: 'overink', label: 'Too much ink, blotting', group: 'Ink', curve: (t) => 0.7 * t ** 1.6 },
  { key: 'splatter', label: 'Ink splatter', group: 'Ink', curve: (t) => 0.75 * t ** 2.2 },
  { key: 'bleed', label: 'Ink bleed into paper', group: 'Ink', curve: (t) => 0.12 + 0.4 * t ** 1.3 },
  { key: 'fade', label: 'Ribbon fade', group: 'Ink', curve: (t) => 0.08 + 0.5 * t },
  { key: 'streaks', label: 'Ribbon streaks', group: 'Ink', curve: (t) => 0.55 * t ** 1.6 },
  { key: 'twotone', label: 'Second colour creeping in', group: 'Ink', curve: (t) => 0.2 + 0.5 * t },
  { key: 'pressure', label: 'Uneven key pressure', group: 'Typist', curve: (t) => 0.1 + 0.9 * t, mechanical: true },
  { key: 'baseline', label: 'Baseline jitter', group: 'Typist', curve: (t) => 0.04 + 0.96 * t ** 1.7, mechanical: true },
  { key: 'typos', label: 'Typos (fixed with your correction style)', group: 'Typist', curve: (t) => 0.04 + 0.7 * t ** 1.3 },
  { key: 'tilt', label: 'Crooked paper', group: 'Typist', curve: (t) => 0.8 * t ** 2, mechanical: true },
  { key: 'double', label: 'Double strikes', group: 'Typist', curve: (t) => 0.9 * t ** 1.8, mechanical: true },
  { key: 'misalign', label: 'Misaligned letters', group: 'Machine', curve: (t) => 0.06 + 0.8 * t, mechanical: true },
  { key: 'filled', label: 'Filled-in letters', group: 'Machine', curve: (t) => 0.8 * t ** 1.3, mechanical: true },
  { key: 'quirks', label: 'Key quirks', group: 'Machine', curve: (t) => 0.3 + 0.45 * t },
  { key: 'caps', label: 'Capitals out of line', group: 'Machine', curve: (t) => 0.9 * t ** 1.5, mechanical: true },
  { key: 'spacing', label: 'Uneven spacing', group: 'Machine', curve: (t) => 0.05 + 0.75 * t ** 1.5, mechanical: true },
  { key: 'grain', label: 'Paper grain', group: 'Paper', curve: (t) => 0.5 + 0.3 * t },
  { key: 'stains', label: 'Coffee stains', group: 'Paper', curve: (t) => 0.55 * t ** 2.5 },
  // folding is a choice, not a skill level: the master slider leaves it alone
  { key: 'folds', label: 'Folded', group: 'Paper', curve: () => 0 },
];

const ELECTRIC: MachineStyle[] = ['selectric', 'electronic'];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The curve value before your offset, for one flaw on one machine. */
export function baseAmount(info: FlawInfo, master: number, machine: MachineStyle): number {
  const k = info.mechanical && ELECTRIC.includes(machine) ? 0.3 : 1;
  return clamp01(info.curve(clamp01(master)) * k);
}

export type FlawAmounts = Record<FlawKey, number> & { ink: number };

export function resolveFlaws(f: Flaws, machine: MachineStyle): FlawAmounts {
  const out = { ink: clamp01(f.ink) } as FlawAmounts;
  for (const info of FLAWS) out[info.key] = clamp01(baseAmount(info, f.master, machine) + (f.offsets[info.key] ?? 0));
  return out;
}

/** Sets one flaw to an absolute amount by storing the offset from its curve. */
export function setFlaw(f: Flaws, key: FlawKey, amount: number, machine: MachineStyle): Flaws {
  const info = FLAWS.find((x) => x.key === key)!;
  const offset = clamp01(amount) - baseAmount(info, f.master, machine);
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

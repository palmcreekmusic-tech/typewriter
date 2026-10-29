// Two whole-look shortcuts: "Surprise me" deals a complete random look, and
// "perfect" is the same page with every flaw taken away, for comparing.

import type { MachineStyle, PaperKind, RibbonKind, Settings } from './types';
import { FLAWS, baseAmount, resolveFlaws, type FlawKey } from './flaws';
import { FONTS } from './fonts';
import { INK } from './presets';
import { surpriseQuirks } from './quirks';
import { FIX_STYLES } from './corrections';
import { rngFor } from './rng';

/** Ink colours with a bit of character, beyond plain black. */
export const INK_COLOURS: [string, string][] = [
  [INK.black, 'Black'],
  [INK.softBlack, 'Worn black'],
  [INK.carbonBlue, 'Carbon blue'],
  ['#7a2a22', 'Ribbon red'],
  ['#3d2b4f', 'Violet copy'],
  ['#2f4a3a', 'Bottle green'],
  ['#5a3a22', 'Sepia'],
];
/** Second colours for a two-colour ribbon. */
export const SECOND_COLOURS: [string, string][] = [
  ['#b0302a', 'Red'],
  ['#2c4f9e', 'Blue'],
  ['#2f7a4a', 'Green'],
  ['#c0821f', 'Ochre'],
];

const MACHINES: MachineStyle[] = ['underwood', 'royal', 'olympia', 'hermes', 'selectric', 'electronic'];
const PAPERS: PaperKind[] = ['bond', 'cream', 'aged', 'onionskin'];

/** A complete random look. Your text, mode and layout stay as they are. */
export function surpriseLook(s: Settings, seed: number): Settings {
  const r = rngFor(seed, 'surprise-look');
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  const machine = pick(MACHINES);
  const electric = machine === 'selectric' || machine === 'electronic';
  const ribbon: RibbonKind = electric ? (r() < 0.7 ? 'film' : 'fabric') : r() < 0.85 ? 'fabric' : 'carbon';

  // lean towards the interesting middle of the range, with the odd extreme
  const master = Math.min(1, Math.max(0.05, 0.2 + 0.55 * r() + (r() < 0.15 ? 0.3 : 0)));
  const offsets: Partial<Record<FlawKey, number>> = {};
  // push two to four flaws well away from where the master slider puts them
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const f = pick(FLAWS.filter((x) => x.key !== 'folds' && x.key !== 'stains'));
    const base = baseAmount(f, master, machine);
    offsets[f.key] = Math.max(-base, Math.min(1 - base, (r() - 0.35) * 0.8));
  }
  if (r() < 0.3) offsets.stains = 0.25 + 0.5 * r() - baseAmount(FLAWS.find((x) => x.key === 'stains')!, master, machine);
  if (r() < 0.25) offsets.folds = 0.3 + 0.6 * r();

  const inkColor = r() < 0.6 ? pick([INK.black, INK.softBlack]) : pick(INK_COLOURS)[0];
  const inkColor2 = r() < 0.22 ? pick(SECOND_COLOURS)[0] : '';

  return {
    ...s,
    seed: Math.floor(r() * 99998) + 1,
    flaws: { master, ink: 0.15 + 0.75 * r(), offsets },
    quirks: surpriseQuirks(Math.floor(r() * 1e9)),
    look: {
      fontId: pick(FONTS).id,
      paper: pick(PAPERS),
      paperTone: Math.round(r() * 100) / 100,
      ribbon,
      inkColor,
      inkColor2,
      machine,
    },
    corrections: {
      ...s.corrections,
      style: electric && r() < 0.6 ? 'tape' : pick(FIX_STYLES.filter((f) => f.style !== 'liftoff')).style,
      mess: Math.round(r() * 100) / 100,
      showThrough: Math.round(r() * 80) / 100,
      rush: Math.round(r() * r() * 100) / 100,
      age: r() < 0.3 ? Math.round(r() * 100) / 100 : 0,
    },
  };
}

/** The same page typed perfectly: no flaws, no damaged keys, healthy ink. The paper stays as it is. */
export function perfectOf(s: Settings): Settings {
  const now = resolveFlaws(s.flaws, s.look.machine);
  const keep = new Set<FlawKey>(['grain', 'stains', 'folds']);
  const offsets: Partial<Record<FlawKey, number>> = {};
  for (const f of FLAWS) offsets[f.key] = (keep.has(f.key) ? now[f.key] : 0) - baseAmount(f, 0, s.look.machine);
  return { ...s, flaws: { master: 0, ink: 0.55, offsets }, quirks: [], look: { ...s.look, inkColor2: '' } };
}

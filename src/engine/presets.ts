// Era and ink presets from the research brief (section 11).
// Milestone 1 uses the look (font, paper, ribbon color, machine). The flaw,
// mistake and correction values are carried here so later milestones can read them.

import type { Look, MachineStyle } from './types';

export type CorrectionStyle = 'whiteout' | 'tape' | 'correction-paper' | 'eraser' | 'x-out' | 'strikethrough' | 'none';

export interface Preset {
  id: string;
  name: string;
  /** one line for the picker */
  blurb: string;
  look: Look;
  pitch: 10 | 12;
  /** 0 = pro typist, 1 = first timer */
  flawLevel: number;
  correction: CorrectionStyle;
}

export const INK = {
  black: '#1d1b1a',
  softBlack: '#2a2624',
  carbonBlue: '#232a3d',
};

export const PRESETS: Preset[] = [
  {
    id: 'underwood-1930s',
    name: '1930s Underwood',
    blurb: 'Tired fabric ribbon on aged bond',
    look: { fontId: 'tt2020-e', paper: 'aged', paperTone: 0.75, ribbon: 'fabric', inkColor: INK.softBlack, machine: 'underwood' },
    pitch: 10,
    flawLevel: 0.6,
    correction: 'x-out',
  },
  {
    id: 'royal-1940s',
    name: '1940s Royal',
    blurb: 'Red and black ribbon, soft white bond',
    look: { fontId: 'tt2020-b', paper: 'bond', paperTone: 0.3, ribbon: 'fabric', inkColor: INK.black, machine: 'royal' },
    pitch: 10,
    flawLevel: 0.45,
    correction: 'strikethrough',
  },
  {
    id: 'olympia-1950s',
    name: '1950s Olympia',
    blurb: 'Fresh black ribbon, cream bond',
    look: { fontId: 'cutive-mono', paper: 'cream', paperTone: 0.5, ribbon: 'fabric', inkColor: INK.black, machine: 'olympia' },
    pitch: 10,
    flawLevel: 0.25,
    correction: 'correction-paper',
  },
  {
    id: 'hermes-1960s',
    name: '1960s Hermes 3000',
    blurb: 'Half-worn ribbon, cream bond, whiteout',
    look: { fontId: 'tt2020-b', paper: 'cream', paperTone: 0.55, ribbon: 'fabric', inkColor: INK.softBlack, machine: 'hermes' },
    pitch: 10,
    flawLevel: 0.3,
    correction: 'whiteout',
  },
  {
    id: 'selectric-1970s',
    name: '1970s Selectric II',
    blurb: 'Fresh carbon film, lift-off tape',
    look: { fontId: 'courier-prime', paper: 'bond', paperTone: 0.1, ribbon: 'film', inkColor: INK.black, machine: 'selectric' },
    pitch: 10,
    flawLevel: 0.05,
    correction: 'tape',
  },
  {
    id: 'daisywheel-1980s',
    name: '1980s Daisywheel',
    blurb: 'Electronic, near perfect',
    look: { fontId: 'ibm-plex-mono', paper: 'bond', paperTone: 0, ribbon: 'film', inkColor: INK.black, machine: 'electronic' },
    pitch: 12,
    flawLevel: 0.02,
    correction: 'tape',
  },
  {
    id: 'carbon-copy',
    name: 'Carbon copy',
    blurb: 'Blue-black copy on onionskin',
    look: { fontId: 'tt2020-d', paper: 'onionskin', paperTone: 0.2, ribbon: 'carbon', inkColor: INK.carbonBlue, machine: 'royal' },
    pitch: 10,
    flawLevel: 0.4,
    correction: 'x-out',
  },
  {
    id: 'attic-find',
    name: 'Attic find',
    blurb: 'Dry ribbon, coffee-stained page',
    look: { fontId: 'special-elite', paper: 'aged', paperTone: 1, ribbon: 'fabric', inkColor: INK.softBlack, machine: 'underwood' },
    pitch: 10,
    flawLevel: 0.85,
    correction: 'x-out',
  },
];

export const DEFAULT_PRESET_ID = 'hermes-1960s';

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Body, key and trim colors for the illustrated machine of each era. */
export interface MachinePalette {
  body: string;
  bodyShade: string;
  trim: string;
  key: string;
  keyText: string;
  keyRing: string;
  platen: string;
  badge: string;
  name: string;
}

export const MACHINES: Record<MachineStyle, MachinePalette> = {
  underwood: { body: '#24221f', bodyShade: '#141311', trim: '#b58f4a', key: '#f1ead8', keyText: '#1e1c1a', keyRing: '#9a9a96', platen: '#1a1a1a', badge: '#c9a35a', name: 'UNDERWOOD' },
  royal: { body: '#5b2f2a', bodyShade: '#3c1d1a', trim: '#d9c9a8', key: '#1f1c1a', keyText: '#efe7d6', keyRing: '#b7b2a8', platen: '#1c1b1a', badge: '#e8dcc0', name: 'ROYAL' },
  olympia: { body: '#6b7f8e', bodyShade: '#4d5e6b', trim: '#e7e2d6', key: '#2b2b2b', keyText: '#f2efe7', keyRing: '#c9c6bf', platen: '#1d1d1d', badge: '#f3eee2', name: 'OLYMPIA' },
  hermes: { body: '#7fa595', bodyShade: '#5b8172', trim: '#efe8d8', key: '#f0eadb', keyText: '#2a3a34', keyRing: '#cfd6cf', platen: '#232625', badge: '#f6f0e2', name: 'HERMES 3000' },
  selectric: { body: '#3f6ea8', bodyShade: '#2c5282', trim: '#d6d9de', key: '#e9e7e2', keyText: '#1f2a38', keyRing: '#9fb1c6', platen: '#202226', badge: '#f0f2f5', name: 'SELECTRIC II' },
  electronic: { body: '#d9d4c8', bodyShade: '#b9b3a6', trim: '#6c6a66', key: '#4a4845', keyText: '#f1eee8', keyRing: '#8d8a84', platen: '#2a2a2a', badge: '#3e3c39', name: 'DAISYWHEEL' },
};

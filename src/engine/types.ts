export type Mode = 'caption' | 'letter' | 'photo';

export type PaperKind = 'bond' | 'cream' | 'aged' | 'onionskin' | 'newsprint' | 'sticky';

export type MachineStyle = 'underwood' | 'royal' | 'olympia' | 'hermes' | 'selectric' | 'electronic';

export type RibbonKind = 'fabric' | 'film' | 'carbon';

export interface LayoutSettings {
  /** characters per inch: 10 = Pica, 12 = Elite */
  pitch: 10 | 12;
  /** 1, 1.5 or 2 lines (at 6 lines per inch) */
  lineSpacing: 1 | 1.5 | 2;
  paperSize: 'letter' | 'a4';
  /** inches */
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  /** columns between tab stops */
  tabSize: number;
  /** caption mode: longest line before wrapping, in characters */
  captionWidth: number;
}

export interface Look {
  fontId: string;
  paper: PaperKind;
  /** how warm the paper is, 0 neutral to 1 very warm */
  paperTone: number;
  ribbon: RibbonKind;
  inkColor: string;
  /** the other half of a two-colour ribbon, '' for a single colour */
  inkColor2: string;
  machine: MachineStyle;
}

import type { Flaws } from './flaws';
import type { Quirk } from './quirks';
import type { CorrectionSettings } from './corrections';
import type { PhotoSettings } from '../photo/plan';

export interface Settings {
  mode: Mode;
  flaws: Flaws;
  /** this machine's damaged keys */
  quirks: Quirk[];
  /** how mistakes are fixed on the page */
  corrections: CorrectionSettings;
  presetId: string;
  /** lift realistic mode's limits so every flaw can go to the extreme */
  artistic: boolean;
  seed: number;
  seedLocked: boolean;
  layout: LayoutSettings;
  look: Look;
  /** photo mode: the print's border and where the caption goes */
  photo: PhotoSettings;
}

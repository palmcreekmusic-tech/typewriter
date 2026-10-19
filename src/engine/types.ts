export type Mode = 'caption' | 'letter';

export type PaperKind = 'bond' | 'cream' | 'aged' | 'onionskin';

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
  machine: MachineStyle;
}

export interface Settings {
  mode: Mode;
  presetId: string;
  seed: number;
  seedLocked: boolean;
  layout: LayoutSettings;
  look: Look;
}

import { DEFAULT_PRESET_ID, presetById } from './presets';
import type { Settings } from './types';
import { MACHINE_QUIRKS } from './quirks';
import { defaultCorrections, presetFixStyle } from './corrections';
import { defaultPhoto } from '../photo/plan';

export const SAMPLE_CAPTION = 'Somewhere west of here, 1962.';

export const SAMPLE_PHOTO = 'The long way home. Kodak Gold, frame 14.';

export const SAMPLE_LETTER = `October 19

Dear friend,

\tThe light came in low across the field this morning, and I stood there with the camera until my hands were cold. Some days the picture is the easy part; it is the words underneath that take all afternoon.

\tWrite back soon.

Yours,
E.`;

export function defaultSettings(): Settings {
  const preset = presetById(DEFAULT_PRESET_ID)!;
  return {
    mode: 'caption',
    presetId: preset.id,
    artistic: false,
    flaws: { typist: preset.typist, machine: preset.machine, ink: preset.ink, offsets: {} },
    quirks: MACHINE_QUIRKS[preset.look.machine].map((q) => ({ ...q })),
    corrections: defaultCorrections(presetFixStyle(preset.correction)),
    seed: 1962,
    seedLocked: false,
    layout: {
      pitch: preset.pitch,
      lineSpacing: 1,
      paperSize: 'letter',
      marginLeft: 1.2,
      marginRight: 1,
      marginTop: 1.1,
      marginBottom: 1,
      tabSize: 5,
      captionWidth: 44,
      surface: 'strip',
    },
    look: { ...preset.look },
    photo: defaultPhoto(),
  };
}

/** Picking a preset changes the look, pitch and flaws; your layout choices stay. */
export function applyPreset(s: Settings, presetId: string): Settings {
  const p = presetById(presetId);
  if (!p) return s;
  return {
    ...s,
    presetId,
    look: { ...p.look },
    layout: { ...s.layout, pitch: p.pitch },
    flaws: { typist: p.typist, machine: p.machine, ink: p.ink, offsets: {} },
    quirks: MACHINE_QUIRKS[p.look.machine].map((q) => ({ ...q })),
    corrections: { ...s.corrections, style: presetFixStyle(p.correction) },
  };
}

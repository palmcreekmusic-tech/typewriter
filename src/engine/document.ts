import { DEFAULT_PRESET_ID, presetById } from './presets';
import type { Settings } from './types';

export const SAMPLE_CAPTION = 'Somewhere west of here, 1962.';

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
    flaws: { master: preset.flawLevel, ink: preset.ink, offsets: {} },
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
    },
    look: { ...preset.look },
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
    flaws: { master: p.flawLevel, ink: p.ink, offsets: {} },
  };
}

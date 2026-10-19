// Remembers your text and settings in this browser only. Everything still
// works when storage is blocked (private windows, previews).
import type { Mode, Settings } from '../engine/types';
import { defaultSettings } from '../engine/document';

const KEY = 'typewriter.v1';

interface Saved {
  settings: Settings;
  texts: Record<Mode, string>;
}

export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Saved>;
    if (!data.settings || !data.texts) return null;
    // fill in anything a newer version added
    const d = defaultSettings();
    return {
      settings: { ...d, ...data.settings, layout: { ...d.layout, ...data.settings.layout }, look: { ...d.look, ...data.settings.look } },
      texts: { caption: data.texts.caption ?? '', letter: data.texts.letter ?? '' },
    };
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function save(data: Saved) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable: nothing to do */
    }
  }, 300);
}

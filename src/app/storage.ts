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
      settings: { ...d, ...data.settings, flaws: { ...d.flaws, ...data.settings.flaws, offsets: { ...data.settings.flaws?.offsets } }, layout: { ...d.layout, ...data.settings.layout }, look: { ...d.look, ...data.settings.look } },
      texts: { caption: data.texts.caption ?? '', letter: data.texts.letter ?? '' },
    };
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Saved | null = null;

function flush() {
  clearTimeout(timer);
  if (!pending) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    /* storage unavailable: nothing to do */
  }
  pending = null;
}

export function save(data: Saved) {
  pending = data;
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}

// closing or reloading the tab mid-debounce shouldn't lose the last change
if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);

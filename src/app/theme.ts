// Day desk or night desk, and which palette. Kept in this browser only;
// ?theme= and ?palette= in the address override both (handy for previews).

export type ThemePref = 'auto' | 'day' | 'night';
export const PALETTES = ['graphite', 'sage', 'oat'] as const;
export type Palette = (typeof PALETTES)[number];

const KEY = 'typewriter.theme';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const dark = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;

function read(): { pref: ThemePref; palette: Palette } {
  let saved: Partial<{ pref: ThemePref; palette: Palette }> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    /* storage unavailable */
  }
  const p = params.get('theme') as ThemePref | null;
  const pal = params.get('palette') as Palette | null;
  return {
    pref: p && ['auto', 'day', 'night'].includes(p) ? p : saved.pref ?? 'auto',
    palette: pal && PALETTES.includes(pal) ? pal : saved.palette && PALETTES.includes(saved.palette) ? saved.palette : 'graphite',
  };
}

let state = read();

export const isNight = (pref: ThemePref = state.pref) => pref === 'night' || (pref === 'auto' && !!dark?.matches);

function apply() {
  const root = document.documentElement;
  root.dataset.theme = isNight() ? 'night' : 'day';
  root.dataset.palette = state.palette;
  // the browser bar matches the bottom of the desk
  const desk = getComputedStyle(root).getPropertyValue('--desk-2').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', desk || '#b9b9b5');
}

const watchers = new Set<() => void>();

/** Runs before the app mounts, so the desk never flashes the wrong colour. */
export function initTheme() {
  apply();
  dark?.addEventListener('change', () => {
    apply();
    watchers.forEach((f) => f());
  });
}

/** Called when the system switches light/dark; returns an unsubscribe. */
export function watchTheme(f: () => void) {
  watchers.add(f);
  return () => watchers.delete(f);
}

export function themePref(): ThemePref {
  return state.pref;
}

export function setTheme(pref: ThemePref, palette: Palette = state.palette) {
  state = { pref, palette };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
  apply();
}

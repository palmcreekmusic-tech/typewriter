// Where a photo was taken, from its GPS position, without asking any
// server: the nearest town of 5,000 people or more from a list bundled
// with the app (GeoNames, CC BY 4.0). Far from any town, it's the
// coordinates instead, the way a surveyor would write them.

export interface Place {
  name: string;
  /** ISO country code */
  country: string;
  /** US state, two letters */
  state?: string;
  /** km from the photo */
  km: number;
}

interface Town {
  name: string;
  country: string;
  state: string;
  lat: number;
  lon: number;
  pop: number;
}

let towns: Promise<Town[]> | null = null;

export function parseTowns(tsv: string): Town[] {
  return tsv
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, country, state, lat, lon, pop] = line.split('\t');
      return { name, country, state, lat: +lat, lon: +lon, pop: +pop || 0 };
    });
}

function loadTowns(): Promise<Town[]> {
  towns ??= fetch('./places/cities.tsv')
    .then((r) => (r.ok ? r.text() : ''))
    .then(parseTowns)
    .catch(() => []);
  return towns;
}

/**
 * The town a photo was taken in or nearest to. A town's point is its
 * centre, so a big city reaches further: standing under the Eiffel Tower
 * is Paris, not the suburb whose centre happens to be closer.
 */
export function nearest(list: Town[], lat: number, lon: number): Place | null {
  let best: Town | null = null;
  let bestScore = Infinity;
  const k = Math.cos((lat * Math.PI) / 180);
  for (const t of list) {
    let dl = Math.abs(t.lon - lon);
    if (dl > 180) dl = 360 - dl;
    // rough km, plenty for ranking
    const d = 111.2 * Math.sqrt((t.lat - lat) ** 2 + (dl * k) ** 2);
    const score = d - 0.006 * Math.sqrt(t.pop);
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (!best) return null;
  // how far outside the town itself
  const km = Math.max(0, haversine(lat, lon, best.lat, best.lon) - 0.006 * Math.sqrt(best.pop));
  return { name: best.name, country: best.country, state: best.state || undefined, km };
}

function haversine(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180;
  const s = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

export async function placeFor(lat: number, lon: number): Promise<Place | null> {
  return nearest(await loadTowns(), lat, lon);
}

/** "37.97° N, 119.02° W" */
export function coords(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

/** The country's name in English, from its code. */
export function countryName(code: string) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

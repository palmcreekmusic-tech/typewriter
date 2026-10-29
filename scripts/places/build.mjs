// Builds the offline place list for photo captions from GeoNames
// (via the all-the-cities package): every town of 5,000 people or more,
// plus smaller ones (1,000 and up) where no bigger town is within 25 km,
// so out-of-the-way places still get a name. One line each: name,
// country, US state, latitude, longitude, population.
// GeoNames data is CC BY 4.0; the credit is in the README and the app.
//   node scripts/places/build.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const cities = require('all-the-cities');
const big = cities.filter((c) => c.population >= 5000);
// a 0.25° grid of the big towns, for the "anything bigger nearby?" check
const cell = (lat, lon) => `${Math.floor(lat * 4)},${Math.floor(lon * 4)}`;
const grid = new Map();
for (const c of big) {
  const [lon, lat] = c.loc.coordinates;
  const k = cell(lat, lon);
  grid.set(k, [...(grid.get(k) ?? []), [lat, lon]]);
}
const km = (a, b, c, d) => {
  const r = Math.PI / 180;
  const s = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
};
const lonely = (lat, lon) => {
  for (let i = -1; i <= 1; i++)
    for (let j = -2; j <= 2; j++)
      for (const [a, b] of grid.get(cell(lat + i * 0.25, lon + j * 0.25)) ?? []) if (km(lat, lon, a, b) < 25) return false;
  return true;
};
const small = cities.filter((c) => c.population < 5000 && lonely(c.loc.coordinates[1], c.loc.coordinates[0]));
const rows = [...big, ...small]
  .map((c) => {
    const [lon, lat] = c.loc.coordinates;
    const state = c.country === 'US' ? c.adminCode : '';
    // population to two figures: enough to tell a city from a village
    const pop = Number(c.population.toPrecision(2));
    return [c.name.replace(/\t/g, ' '), c.country, state, lat.toFixed(3), lon.toFixed(3), pop].join('\t');
  });
mkdirSync('public/places', { recursive: true });
writeFileSync('public/places/cities.tsv', rows.join('\n') + '\n');
console.log(rows.length, 'places');

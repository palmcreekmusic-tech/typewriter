// Renders public/favicon.svg to the 180 px apple-touch-icon.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../../public/favicon.svg', import.meta.url), 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 180, height: 180 } });
// full-bleed square: iOS rounds the corners itself
await p.setContent(`<body style="margin:0;background:#f2efe8">${svg.replace('<svg ', '<svg width="180" height="180" ').replace('rx="12"', 'rx="0"').replace('x="4" y="4" width="56" height="56"', 'x="0" y="0" width="64" height="64"')}</body>`);
await p.screenshot({ path: new URL('../../public/apple-touch-icon.png', import.meta.url).pathname });
await b.close();

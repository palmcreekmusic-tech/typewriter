// Saves videos through the Save panel: a caption as a 9:16 story, a letter
// as 16:9, and the caption as ink-only WebM. Needs `vite --port 5173`.
//   node scripts/dev/video.mjs <out-dir/>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '/tmp/claude-0/shots/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
p.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await p.goto('http://localhost:5173/?palette=graphite&theme=day');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(800);
const save = async (file, opts) => {
  await p.click('button[title="Save a picture, a PDF or a video"]');
  await p.click('.panel button:has-text("Video")');
  await p.click(`.panel button:has-text("${opts.aspect}")`);
  await p.click(`.panel button:has-text("${opts.paper ? 'On the paper' : 'Ink only'}")`);
  if (opts.shot) await p.screenshot({ path: out + opts.shot });
  const t0 = Date.now();
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 600000 }), p.click('button.save')]);
  await d.saveAs(out + file);
  console.log(file, d.suggestedFilename(), ((Date.now() - t0) / 1000).toFixed(1) + 's');
};
await save('video-caption-story.mp4', { aspect: '9:16', paper: true, shot: 'video-panel.png' });
await save('video-caption-ink.webm', { aspect: '1:1', paper: false });
await p.click('.seg button:has-text("Letter")');
await p.waitForTimeout(800);
await save('video-letter-wide.mp4', { aspect: '16:9', paper: true });
await b.close();

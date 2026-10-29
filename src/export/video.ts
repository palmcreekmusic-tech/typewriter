// The type-on video: the same performance as Play, drawn frame by frame
// and encoded in the browser, with the keystrokes rendered offline under
// it. Nothing is recorded in real time, so a slow phone makes the same
// video as a fast Mac, only slower.
//
// The camera holds the sheet at a readable size: a short caption or card
// sits whole in the frame; a letter fills the width and the view follows
// the line being typed, the way your eye would.

import { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, AudioBufferSource, QUALITY_HIGH, getFirstEncodableAudioCodec } from 'mediabunny';
import { ASPECTS, FPS, LEAD, framing, spedUp, videoTiming, type Aspect } from './timing';
import { renderPage, BASELINE, type RenderOptions } from '../render/page';
import { makeCanvas, ctx2d, release, type AnyCanvas } from '../render/canvas';
import { revealAt, type Performance } from '../engine/performance';
import { renderPerformance } from '../audio/player';
import { stampMark } from './still';
import type { Tier } from './plan';

export { ASPECTS, framing, spedUp, videoTiming, type Aspect };
import type { Layout } from '../engine/layout';
import type { Fix } from '../engine/corrections';
import type { Settings } from '../engine/types';

export interface VideoInput {
  layout: Layout;
  settings: Settings;
  fixes: Map<number, Fix>;
  perf: Performance;
  print?: (ppi: number) => RenderOptions['print'];
}

export interface VideoOptions {
  aspect: Aspect;
  /** false: ink only, on transparent (WebM) */
  paper: boolean;
  sound: boolean;
  /** the desk behind the sheet, a CSS colour */
  desk: string;
  tier: Tier;
  onProgress?: (done: number) => void;
  signal?: AbortSignal;
}

export async function renderVideo(input: VideoInput, o: VideoOptions): Promise<{ blob: Blob; ext: 'mp4' | 'webm'; timing: ReturnType<typeof videoTiming> }> {
  const k = o.tier.pro ? 2 : 1;
  const W = ASPECTS[o.aspect].w * k;
  const H = ASPECTS[o.aspect].h * k;
  const timing = videoTiming(input.perf.duration, o.tier);
  const perf = spedUp(input.perf, timing.speed);
  const frames = Math.ceil(timing.duration * FPS);

  const webm = !o.paper;
  const output = new Output({ format: webm ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const frame = makeCanvas(W, H) as OffscreenCanvas | HTMLCanvasElement;
  const fx = ctx2d(frame);
  const video = new CanvasSource(frame, { codec: webm ? 'vp9' : 'avc', bitrate: QUALITY_HIGH, alpha: webm ? 'keep' : 'discard', keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: FPS });

  let audio: AudioBufferSource | null = null;
  let sound: AudioBuffer | null = null;
  if (o.sound) {
    const codec = await getFirstEncodableAudioCodec(webm ? ['opus'] : ['aac', 'opus']);
    if (codec) {
      audio = new AudioBufferSource({ codec, bitrate: QUALITY_HIGH });
      output.addAudioTrack(audio);
      sound = await renderPerformance(perf, input.settings.look.machine, input.settings.seed);
    }
  }
  await output.start();

  // the sheet, redrawn only when something new reaches the paper
  let sheet: AnyCanvas | null = null;
  let sheetKey = '';
  let camY = NaN;
  const pg0 = input.layout.pages[0];
  const { ppi } = framing(pg0.width, pg0.height, W, H);
  const print = o.paper ? input.print?.(ppi) : undefined;

  for (let i = 0; i < frames; i++) {
    if (o.signal?.aborted) {
      await output.cancel();
      throw new DOMException('Cancelled', 'AbortError');
    }
    const t = i / FPS - LEAD;
    const reveal = revealAt(perf, Math.max(0, t), input.layout, input.fixes);
    const before = t < 0;
    const page = reveal.caret.page;
    const pg = input.layout.pages[page] ?? pg0;
    const key = `${page}|${before ? -1 : reveal.upTo}|${reveal.unover.size}|${reveal.unfixed.size}`;
    if (key !== sheetKey) {
      sheetKey = key;
      if (!sheet || sheet.width !== Math.round(pg.width * ppi) || sheet.height !== Math.round(pg.height * ppi)) {
        release(sheet);
        sheet = makeCanvas(pg.width * ppi, pg.height * ppi);
      }
      const r = before ? { ...reveal, upTo: 0 } : reveal;
      renderPage(ctx2d(sheet), { layout: input.layout, settings: input.settings, page, ppi, withPaper: o.paper, fixes: input.fixes, reveal: r, print });
    }

    // follow the line being typed, gently, never past the paper's edge
    const sw = pg.width * ppi;
    const sh = pg.height * ppi;
    let y: number;
    if (sh <= H * 0.94) y = (H - sh) / 2;
    else {
      const caretY = (input.layout.originY + reveal.caret.row * input.layout.cellH + BASELINE) * ppi;
      const want = Math.max(H - sh - H * 0.04, Math.min(H * 0.04, H * 0.55 - caretY));
      camY = Number.isNaN(camY) ? want : camY + (want - camY) * 0.12;
      y = camY;
    }
    const x = (W - sw) / 2;

    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.globalCompositeOperation = 'source-over';
    fx.clearRect(0, 0, W, H);
    if (o.paper) {
      fx.fillStyle = o.desk;
      fx.fillRect(0, 0, W, H);
      fx.save();
      fx.shadowColor = 'rgba(20, 20, 18, 0.35)';
      fx.shadowBlur = 0.12 * ppi;
      fx.shadowOffsetY = 0.05 * ppi;
      fx.drawImage(sheet as CanvasImageSource, Math.round(x), Math.round(y));
      fx.restore();
    } else fx.drawImage(sheet as CanvasImageSource, Math.round(x), Math.round(y));
    if (o.tier.mark) stampMark(fx, W, H, o.paper, 'center');

    await video.add(i / FPS, 1 / FPS);
    o.onProgress?.((i + 1) / frames);
  }
  release(sheet);

  if (audio && sound) {
    // silence under the lead-in, then the typing, cut to the video's length
    const sr = sound.sampleRate;
    const len = Math.ceil(timing.duration * sr);
    const buf = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: sound.numberOfChannels });
    const at = Math.round(LEAD * sr);
    for (let c = 0; c < sound.numberOfChannels; c++) buf.copyToChannel(sound.getChannelData(c).subarray(0, Math.max(0, len - at)), c, at);
    await audio.add(buf);
  }
  video.close();
  audio?.close();
  await output.finalize();
  const bytes = (output.target as BufferTarget).buffer!;
  return { blob: new Blob([bytes], { type: webm ? 'video/webm' : 'video/mp4' }), ext: webm ? 'webm' : 'mp4', timing };
}

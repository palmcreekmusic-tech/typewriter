<script lang="ts">
  // The desk: just the sheet. While typing, the sheet slides under a fixed
  // printing point the way a carriage carries it, so the letter being typed
  // always lands in the same spot. "See the page" settles the whole sheet
  // in the middle of the desk.
  import { onMount } from 'svelte';
  import type { Layout } from '../engine/layout';
  import { LINES_PER_INCH } from '../engine/layout';
  import type { Settings } from '../engine/types';
  import { renderPage } from '../render/page';
  import type { Fix } from '../engine/corrections';
  import type { Reveal } from '../engine/performance';
  import { renderPrint } from '../photo/print';
  import type { Photo } from './photoStore';

  interface Props {
    layout: Layout;
    settings: Settings;
    text: string;
    caretIndex: number;
    view: 'typewriter' | 'page';
    fontsReady: boolean;
    strikeTick: number;
    fixes: Map<number, Fix>;
    onCaretRequest: (index: number) => void;
    onFocusRequest: () => void;
    hint?: string;
    /** Play mode: what has been typed so far */
    reveal?: Reveal;
    /** photo mode: the picture being captioned */
    photo?: Photo;
  }
  let { layout, settings, text, caretIndex, view, fontsReady, strikeTick, fixes, onCaretRequest, onFocusRequest, hint = '', reveal, photo }: Props = $props();

  const BASELINE = 0.78 / LINES_PER_INCH;

  let stageEl: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let sheetInner: HTMLDivElement;
  let stageW = $state(1000);
  let stageH = $state(700);
  let dpr = $state(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  let pageViewPage = $state(0);

  const caret = $derived(reveal?.caret ?? layout.caret[Math.min(caretIndex, layout.caret.length - 1)] ?? { page: 0, row: 0, col: 0 });
  const shownPage = $derived(view === 'page' ? Math.min(pageViewPage, layout.pages.length - 1) : caret.page);
  const paper = $derived(layout.pages[shownPage] ?? layout.pages[0]);

  // How many inches of desk fit across the screen while typing. Captions
  // are short, so the view leans in close to the type.
  const portrait = $derived(stageH > stageW * 1.1);
  const viewW = $derived(layout.mode === 'caption' ? (portrait ? 4.6 : 8) : layout.mode === 'photo' ? (portrait ? 6.2 : 10) : portrait ? 7 : 13);
  // px per inch while typing
  // a caption strip on a phone fits the width, so the whole line stays in view
  const fitW = $derived(layout.mode !== 'letter' && portrait ? (stageW - 32) / paper.width : Infinity);
  const sType = $derived(Math.min(stageW / viewW, stageH / (layout.mode === 'caption' ? 3.2 : layout.mode === 'photo' ? 6 : 8), fitW));
  // room the header and toolbar take, so the page sits in the clear space between
  // (on phones the mode switch sits on a second row)
  const padTop = $derived(stageW <= 560 ? 106 : 64);
  const padBottom = $derived(stageW <= 900 ? 200 : 96);
  // px per inch in page view
  const sPage = $derived(Math.min((stageW - 40) / paper.width, (stageH - padTop - padBottom - 24) / paper.height, 160));
  const s = $derived(view === 'page' ? sPage : sType);
  // Phones get a smaller pixel budget per sheet: Safari caps canvas memory
  // and goes blank past it.
  const maxPx = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 5e6 : 14e6;
  const ppi = $derived(Math.max(72, Math.min(300, Math.round(s * dpr), Math.floor(Math.sqrt(maxPx / (paper.width * paper.height))))));
  // the printing point, in stage px
  const typeLineY = $derived(padTop + (stageH - padTop - padBottom) * (portrait ? 0.42 : 0.48));
  // a little right of center, so more of what you've typed stays in view
  const typePointX = $derived(stageW * (portrait ? 0.64 : 0.58));

  // caret in paper inches
  const caretX = $derived(layout.originX + caret.col * layout.cellW + layout.cellW / 2);
  const caretY = $derived(layout.originY + caret.row * layout.cellH + BASELINE);

  // While typing the sheet slides under the printing point like a carriage;
  // a sheet narrow enough to fit only slides as far as the screen allows.
  const carriageLeft = $derived.by(() => {
    const x = typePointX - caretX * s;
    const w = paper.width * s;
    return w <= stageW - 32 ? Math.min(stageW - 16 - w, Math.max(16, x)) : x;
  });
  const paperLeft = $derived(view === 'page' ? (stageW - paper.width * s) / 2 : carriageLeft);
  const paperTop = $derived(view === 'page' ? padTop + (stageH - padTop - padBottom - paper.height * s) / 2 : typeLineY - caretY * s);

  // Each strike gives the sheet a tiny knock, like the typebar hitting the platen.
  $effect(() => {
    if (!strikeTick || !sheetInner || view === 'page') return;
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    sheetInner.animate([{ transform: 'translateY(-0.8px) scale(1.0006)' }, { transform: 'none' }], { duration: 110, easing: 'ease-out' });
  });

  // A carriage return or a jump is a long slide; a keystroke is a quick tick.
  let lastLeft = 0;
  let slide = $state(false);
  $effect(() => {
    const d = Math.abs(paperLeft - lastLeft);
    slide = d > layout.cellW * s * 2.5;
    lastLeft = paperLeft;
  });

  // Fast typing queues one redraw per frame, always with the latest text.
  let queued: Parameters<typeof renderPage>[1] | null = null;
  let frame = 0;
  $effect(() => {
    if (!canvas || !fontsReady) return;
    // read text so edits re-render even when layout identity is reused
    void text;
    // snapshot reads every field, so any settings change schedules a redraw
    queued = { layout, settings: $state.snapshot(settings) as typeof settings, page: shownPage, ppi, withPaper: true, fixes, reveal };
    const plan = layout.print;
    if (plan && photo) queued.print = { canvas: renderPrint(photo.source, photo.id, plan, ppi, settings.seed), strip: plan.strip };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const o = queued;
      if (!o || !canvas) return;
      queued = null;
      const w = Math.round(paper.width * o.ppi);
      const h = Math.round(paper.height * o.ppi);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) renderPage(ctx, o);
    });
  });

  onMount(() => {
    const ro = new ResizeObserver(() => {
      const r = stageEl.getBoundingClientRect();
      stageW = r.width;
      stageH = r.height;
      dpr = window.devicePixelRatio || 1;
    });
    ro.observe(stageEl);
    return () => ro.disconnect();
  });

  /**
   * Click on the sheet: put the caret at the nearest character. This runs on
   * click, not pointerdown: on touch screens the tap's own mousedown comes
   * after pointerdown and would take the focus straight back off the text box.
   */
  function onPaperPointer(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const xIn = ((e.clientX - rect.left) / rect.width) * paper.width;
    const yIn = ((e.clientY - rect.top) / rect.height) * paper.height;
    let best = caretIndex;
    let bestD = Infinity;
    layout.caret.forEach((p, i) => {
      if (p.page !== shownPage) return;
      const px = layout.originX + p.col * layout.cellW;
      const py = layout.originY + p.row * layout.cellH + BASELINE * 0.6;
      const d = ((px - xIn) / layout.cellW) ** 2 + ((py - yIn) / layout.cellH) ** 2 * 4;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    onCaretRequest(best);
  }

  export function showPage(i: number) {
    pageViewPage = Math.max(0, Math.min(layout.pages.length - 1, i));
  }
</script>

<div
  class="stage"
  class:pageview={view === 'page'}
  bind:this={stageEl}
  role="presentation"
  onclick={(e) => {
    if (e.target === stageEl) onFocusRequest();
  }}
>
  <div
    class="sheet"
    class:slide
    class:strip={layout.mode === 'caption'}
    style="width:{paper.width * s}px; height:{paper.height * s}px; transform: translate({paperLeft}px, {paperTop}px)"
  >
    <div class="knock" bind:this={sheetInner}>
      <canvas bind:this={canvas} onclick={onPaperPointer} aria-label="Typed page"></canvas>
    {#if fontsReady}
      <div
        class="caret"
        style="left:{(caretX - layout.cellW / 2) * s}px; top:{(caretY + 0.012) * s}px; width:{layout.cellW * s}px"
      ></div>
    {/if}
    </div>
  </div>

  {#if view === 'typewriter' && fontsReady}
    <!-- the type line: small marks at the desk edges, like a carriage scale -->
    <div class="guide" style="width:{stageW}px; transform: translateY({typeLineY}px)" aria-hidden="true"></div>
  {/if}

  {#if view === 'page' && layout.pages.length > 1}
    <div class="pager">
      <button type="button" onclick={() => showPage(shownPage - 1)} disabled={shownPage === 0} aria-label="Previous page">‹</button>
      <span>Page {shownPage + 1} of {layout.pages.length}</span>
      <button type="button" onclick={() => showPage(shownPage + 1)} disabled={shownPage >= layout.pages.length - 1} aria-label="Next page">›</button>
    </div>
  {/if}

  {#if hint && fontsReady}
    <div class="hint" aria-hidden="true" style="transform: translate(-50%, {typeLineY + 46}px)">{hint}</div>
  {/if}

  {#if !fontsReady}
    <div class="loading">Threading the ribbon…</div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    cursor: text;
    touch-action: manipulation;
  }
  .stage > * {
    position: absolute;
    left: 0;
    top: 0;
  }
  .sheet {
    transition: transform 70ms ease-out, width 400ms ease, height 400ms ease;
    /* lit from straight above: the shadow falls straight down */
    box-shadow:
      0 1px 1px rgba(var(--shadow), 0.12),
      0 14px 30px -14px rgba(var(--shadow), 0.45);
  }
  .sheet.strip {
    box-shadow:
      0 1px 1px rgba(var(--shadow), 0.14),
      0 10px 22px -10px rgba(var(--shadow), 0.45);
  }
  .sheet canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .pageview .sheet {
    transition: transform 420ms cubic-bezier(0.3, 0.8, 0.2, 1), width 420ms ease, height 420ms ease;
  }
  .knock {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .slide {
    transition-duration: 320ms;
    transition-timing-function: cubic-bezier(0.25, 0.9, 0.3, 1);
  }
  .guide {
    pointer-events: none;
    height: 0;
  }
  .guide::before,
  .guide::after {
    content: '';
    position: absolute;
    top: -1px;
    width: 18px;
    height: 2px;
    border-radius: 1px;
    background: var(--text-2);
    opacity: 0.4;
  }
  .guide::before {
    left: 0;
  }
  .guide::after {
    right: 0;
  }
  .caret {
    position: absolute;
    height: max(2px, 0.12em);
    min-height: 2px;
    background: var(--accent);
    opacity: 0.8;
    animation: blink 1.1s steps(1) infinite;
    pointer-events: none;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .pager {
    left: 50% !important;
    top: auto !important;
    bottom: 104px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--surface);
    border: var(--hair) solid var(--line);
    color: var(--text);
    padding: 4px 8px;
    border-radius: 999px;
    font: 0.8125rem var(--ui);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .pager button {
    background: none;
    border: 0;
    color: inherit;
    font-size: 22px;
    line-height: 1;
    padding: 2px 8px;
    cursor: pointer;
  }
  .pager button:disabled {
    opacity: 0.3;
  }
  .hint {
    left: 50% !important;
    pointer-events: none;
    white-space: nowrap;
    background: var(--surface);
    border: var(--hair) solid var(--line);
    color: var(--text-2);
    padding: 6px 12px;
    border-radius: 999px;
    font: 0.8125rem var(--ui);
  }
  .loading {
    left: 50% !important;
    top: 40% !important;
    transform: translateX(-50%);
    color: var(--text-2);
    font: 0.9375rem var(--ui);
  }
  @media (max-width: 900px) {
    .pager {
      bottom: 206px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet {
      transition: none !important;
    }
  }
</style>

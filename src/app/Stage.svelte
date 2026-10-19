<script lang="ts">
  // The desk: the illustrated typewriter with the sheet in it.
  // In "typewriter" view the carriage carries the paper so the letter being
  // typed always sits at the printing point, like the real thing.
  // In "page" view the machine steps aside and the whole sheet is shown.
  import { onMount } from 'svelte';
  import type { Layout } from '../engine/layout';
  import { LINES_PER_INCH } from '../engine/layout';
  import type { Settings } from '../engine/types';
  import { MACHINES } from '../engine/presets';
  import { renderPage } from '../render/page';
  import MachineBody from './MachineBody.svelte';
  import Carriage from './Carriage.svelte';

  interface Props {
    layout: Layout;
    settings: Settings;
    text: string;
    caretIndex: number;
    view: 'typewriter' | 'page';
    fontsReady: boolean;
    pressed: string | null;
    strikeTick: number;
    onCaretRequest: (index: number) => void;
    onFocusRequest: () => void;
  }
  let { layout, settings, text, caretIndex, view, fontsReady, pressed, strikeTick, onCaretRequest, onFocusRequest }: Props = $props();

  const WORLD_W = 14.5; // inches: the carriage at rest
  const BODY_H = 6.05;
  const BODY_GAP = 0.1; // the machine's deck sits just under the type line
  const BASELINE = 0.78 / LINES_PER_INCH;

  let stageEl: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let stageW = $state(1000);
  let stageH = $state(700);
  let dpr = $state(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  let pageViewPage = $state(0);

  const palette = $derived(MACHINES[settings.look.machine]);
  const manual = $derived(settings.look.machine !== 'selectric' && settings.look.machine !== 'electronic');
  const caret = $derived(layout.caret[Math.min(caretIndex, layout.caret.length - 1)] ?? { page: 0, row: 0, col: 0 });
  const shownPage = $derived(view === 'page' ? Math.min(pageViewPage, layout.pages.length - 1) : caret.page);
  const paper = $derived(layout.pages[shownPage] ?? layout.pages[0]);

  // Captions are short, so the view leans in closer to the type. Tall
  // phone screens lean in too, cropping the ends of the machine.
  const portrait = $derived(stageH > stageW * 1.1);
  const viewW = $derived(layout.mode === 'caption' ? (portrait ? 5.6 : 10.5) : portrait ? 9.5 : WORLD_W);
  const paperAbove = $derived(layout.mode === 'caption' ? 2.3 : 4.1);
  // px per inch in typewriter view
  const sMachine = $derived(Math.min(stageW / viewW, stageH / (paperAbove + BODY_H * 0.62)));
  // px per inch in page view
  const sPage = $derived(Math.min((stageW - 40) / paper.width, (stageH - 150) / paper.height, 160));
  const s = $derived(view === 'page' ? sPage : sMachine);
  const ppi = $derived(Math.max(72, Math.min(300, Math.round(s * dpr))));
  // world origin (left/top of the 14.5in machine world) in stage px
  const worldLeft = $derived((stageW - WORLD_W * sMachine) / 2);
  const typeLineY = $derived(portrait ? stageH * 0.42 : Math.min(paperAbove * sMachine + 36, stageH * 0.58));
  const typePointX = $derived(worldLeft + (WORLD_W / 2) * sMachine);

  // caret in paper inches
  const caretX = $derived(layout.originX + caret.col * layout.cellW + layout.cellW / 2);
  const caretY = $derived(layout.originY + caret.row * layout.cellH + BASELINE);

  const paperLeft = $derived(view === 'page' ? (stageW - paper.width * s) / 2 : typePointX - caretX * s);
  const paperTop = $derived(view === 'page' ? (stageH - paper.height * s) / 2 : typeLineY - caretY * s);
  const carriageLeft = $derived(paperLeft + (paper.width / 2) * sMachine - (WORLD_W / 2) * sMachine);
  // The rest of the sheet is wrapped around the platen, out of sight.
  const clipBottom = $derived(view === 'page' ? 0 : Math.max(0, paper.height * s - (typeLineY + BODY_GAP * sMachine * 0.6 - paperTop)));

  // A carriage return or a jump is a long slide; a keystroke is a quick tick.
  let lastLeft = 0;
  let slide = $state(false);
  $effect(() => {
    const d = Math.abs(paperLeft - lastLeft);
    slide = d > layout.cellW * s * 2.5;
    lastLeft = paperLeft;
  });

  $effect(() => {
    if (!canvas || !fontsReady) return;
    const w = Math.round(paper.width * ppi);
    const h = Math.round(paper.height * ppi);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // read text so edits re-render even when layout identity is reused
    void text;
    renderPage(ctx, { layout, settings, page: shownPage, ppi, withPaper: true });
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

  /** Click on the sheet: put the caret at the nearest character. */
  function onPaperPointer(e: PointerEvent) {
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
    e.preventDefault();
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
  onpointerdown={(e) => {
    if (e.target === stageEl) onFocusRequest();
  }}
>
  {#if view === 'typewriter'}
    <div
      class="carriage back"
      class:slide
      style="width:{WORLD_W * sMachine}px; transform: translate({carriageLeft}px, {typeLineY - 1.75 * sMachine}px)"
    >
      <Carriage part="back" {palette} {manual} />
    </div>
  {/if}

  <div
    class="sheet"
    class:slide
    class:strip={layout.mode === 'caption'}
    style="width:{paper.width * s}px; height:{paper.height * s}px; transform: translate({paperLeft}px, {paperTop}px); clip-path: inset(-40px -40px {clipBottom}px -40px)"
  >
    <canvas bind:this={canvas} onpointerdown={onPaperPointer} aria-label="Typed page"></canvas>
    {#if fontsReady}
      <div
        class="caret"
        style="left:{(caretX - layout.cellW / 2) * s}px; top:{(caretY + 0.012) * s}px; width:{layout.cellW * s}px"
      ></div>
    {/if}
  </div>

  {#if view === 'typewriter'}
    <div
      class="carriage front"
      class:slide
      style="width:{WORLD_W * sMachine}px; transform: translate({carriageLeft}px, {typeLineY - 1.7 * sMachine}px)"
    >
      <Carriage part="front" {palette} {manual} />
    </div>
  {/if}

  <div
    class="machine"
    class:away={view === 'page'}
    style="width:{13 * sMachine}px; transform: translate({worldLeft + 0.75 * sMachine}px, {typeLineY + BODY_GAP * sMachine}px)"
  >
    <MachineBody style={settings.look.machine} {palette} {pressed} {strikeTick} ribbonColor={settings.look.ribbon === 'film' ? '#151515' : '#24201d'} />
  </div>

  {#if view === 'page' && layout.pages.length > 1}
    <div class="pager">
      <button type="button" onclick={() => showPage(shownPage - 1)} disabled={shownPage === 0} aria-label="Previous page">‹</button>
      <span>Page {shownPage + 1} of {layout.pages.length}</span>
      <button type="button" onclick={() => showPage(shownPage + 1)} disabled={shownPage >= layout.pages.length - 1} aria-label="Next page">›</button>
    </div>
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
    box-shadow:
      0 1px 0 rgba(0, 0, 0, 0.05),
      0 18px 40px -12px rgba(30, 18, 8, 0.55),
      0 2px 6px rgba(30, 18, 8, 0.25);
  }
  .sheet.strip {
    box-shadow:
      0 10px 24px -8px rgba(30, 18, 8, 0.6),
      0 1px 3px rgba(30, 18, 8, 0.3);
  }
  .sheet canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .pageview .sheet {
    transition: transform 420ms cubic-bezier(0.3, 0.8, 0.2, 1), width 420ms ease, height 420ms ease;
  }
  .carriage {
    transition: transform 70ms ease-out;
    pointer-events: none;
  }
  .slide,
  .carriage.slide {
    transition-duration: 320ms;
    transition-timing-function: cubic-bezier(0.25, 0.9, 0.3, 1);
  }
  .machine {
    pointer-events: none;
    transition: transform 420ms cubic-bezier(0.3, 0.8, 0.2, 1), opacity 300ms ease;
  }
  .machine.away {
    opacity: 0;
    translate: 0 60vh;
  }
  .caret {
    position: absolute;
    height: max(2px, 0.12em);
    min-height: 2px;
    background: #c0392b;
    opacity: 0.75;
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
    bottom: 14px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(32, 24, 18, 0.72);
    color: #f3ead6;
    padding: 6px 10px;
    border-radius: 999px;
    font: 14px var(--mono);
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
  .loading {
    left: 50% !important;
    top: 40% !important;
    transform: translateX(-50%);
    color: #f3ead6;
    font: 16px var(--mono);
    opacity: 0.8;
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .carriage,
    .machine {
      transition: none !important;
    }
  }
</style>

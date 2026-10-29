<script lang="ts">
  // Saving what you typed: a picture of the sheet or a PDF of every page,
  // on its paper or as ink alone. The web version is the free one.
  import type { Tier } from '../export/plan';
  import { ASPECTS, supportsInkOnly, type Aspect } from '../export/timing';

  export type StillFormat = 'png' | 'pdf';
  export interface VideoChoice {
    aspect: Aspect;
    paper: boolean;
    sound: boolean;
  }
  interface Props {
    open: boolean;
    tier: Tier;
    /** px of the long edge each format will come out at */
    sizeFor: (format: StillFormat) => string;
    pages: number;
    /** how long the video runs, and how much it's sped up to fit */
    videoNote: () => string;
    onSave: (format: StillFormat, paper: boolean) => Promise<void>;
    onSaveVideo: (v: VideoChoice, onProgress: (p: number) => void, signal: AbortSignal) => Promise<void>;
    onClose: () => void;
  }
  let { open, tier, sizeFor, pages, videoNote, onSave, onSaveVideo, onClose }: Props = $props();

  let format = $state<StillFormat | 'video'>('png');
  let paper = $state(true);
  let aspect = $state<Aspect>('9:16');
  let sound = $state(true);
  let busy = $state(false);
  let progress = $state(0);
  let error = $state('');
  let inkVideo = $state(true);
  let abort: AbortController | null = null;
  $effect(() => {
    if (open) void supportsInkOnly().then((ok) => (inkVideo = ok));
  });
  const canInk = $derived(format !== 'video' || inkVideo);

  async function save() {
    busy = true;
    error = '';
    progress = 0;
    abort = new AbortController();
    try {
      if (format === 'video') await onSaveVideo({ aspect, paper: paper || !canInk, sound }, (p) => (progress = p), abort.signal);
      else await onSave(format, paper);
      onClose();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) error = e instanceof Error ? e.message : 'Saving failed';
    } finally {
      busy = false;
      abort = null;
    }
  }
  function close() {
    abort?.abort();
    onClose();
  }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={() => !busy && close()}></div>
  <div class="panel" role="dialog" aria-modal="true" aria-labelledby="export-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && close()}>
    <header>
      <h2 id="export-title">Save</h2>
      <button type="button" class="close" onclick={close} aria-label="Close">×</button>
    </header>
    <div class="field">
      <span>Format</span>
      <div class="seg">
        <button type="button" aria-pressed={format === 'png'} onclick={() => (format = 'png')}>Picture (PNG)</button>
        <button type="button" aria-pressed={format === 'pdf'} onclick={() => (format = 'pdf')}>PDF{pages > 1 ? `, ${pages} pp` : ''}</button>
        <button type="button" aria-pressed={format === 'video'} onclick={() => (format = 'video')}>Video</button>
      </div>
    </div>
    {#if format === 'video'}
      <div class="field">
        <span>Shape</span>
        <div class="seg">
          {#each Object.entries(ASPECTS) as [k, a]}
            <button type="button" aria-pressed={aspect === k} onclick={() => (aspect = k as Aspect)} title={a.label}>{k}</button>
          {/each}
        </div>
      </div>
    {/if}
    <div class="field">
      <span>Background</span>
      <div class="seg">
        <button type="button" aria-pressed={paper} onclick={() => (paper = true)}>On the paper</button>
        <button type="button" aria-pressed={!paper && canInk} disabled={!canInk} onclick={() => (paper = false)}>Ink only</button>
      </div>
      {#if !paper && canInk}<p class="why">Transparent{format === 'video' ? ' WebM' : ''}, so the type sits on any photo, design or edit.</p>{/if}
      {#if !canInk}<p class="why">This browser can't make see-through video. Chrome can.</p>{/if}
    </div>
    {#if format === 'video'}
      <label class="check"><input type="checkbox" bind:checked={sound} /> <span>Keystroke sound</span></label>
      <p class="why size">{ASPECTS[aspect].w * (tier.pro ? 2 : 1)} × {ASPECTS[aspect].h * (tier.pro ? 2 : 1)} px, {videoNote()}</p>
    {:else}
      <p class="why size">{sizeFor(format)}{format === 'png' && pages > 1 ? ', this page' : ''}</p>
    {/if}
    {#if tier.mark}
      <p class="why">
        Saved from the web with a small “typed with type[writer]” mark, {format === 'video' ? `1080p and up to ${tier.maxVideo} seconds` : `up to ${tier.maxStill} px`}. The Mac and iPhone apps save
        {format === 'video' ? 'in 4K, at any length' : 'at full print size'}, with no mark.
      </p>
    {/if}
    {#if error}<p class="why err" role="alert">{error}</p>{/if}
    {#if busy && format === 'video'}
      <div class="bar" role="progressbar" aria-label="Making the video" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}><i style:width="{progress * 100}%"></i></div>
    {/if}
    <button type="button" class="save" onclick={save} disabled={busy}>{busy ? (format === 'video' ? `Making the video… ${Math.round(progress * 100)}%` : 'Saving…') : 'Save'}</button>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
  }
  .panel {
    position: fixed;
    z-index: 41;
    top: 62px;
    right: 16px;
    width: min(340px, calc(100vw - 32px));
    padding: 14px 16px 16px;
    background: var(--surface-solid);
    color: var(--text);
    border: var(--hair) solid var(--line);
    border-radius: 14px;
    box-shadow: 0 18px 40px -16px rgba(var(--shadow), 0.45);
    font-family: var(--ui);
  }
  @media (max-width: 560px) {
    .panel {
      top: auto;
      bottom: max(14px, env(safe-area-inset-bottom));
      left: 16px;
      right: 16px;
      width: auto;
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  h2 {
    font: 600 0.9375rem var(--ui);
    margin: 0;
  }
  .close {
    font-size: 24px;
    line-height: 1;
    background: none;
    border: 0;
    color: var(--text-2);
    cursor: pointer;
    padding: 4px 8px;
  }
  .field {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 0.8125rem;
  }
  .field > span {
    color: var(--text-2);
  }
  .seg {
    display: flex;
    gap: 6px;
  }
  .seg button {
    flex: 1;
    font: 500 0.8125rem var(--ui);
    padding: 7px 10px;
    border-radius: 8px;
    border: var(--hair) solid var(--line);
    background: none;
    color: var(--text);
    cursor: pointer;
    white-space: nowrap;
  }
  .seg button[aria-pressed='true'] {
    background: var(--sel);
    color: var(--on-sel);
    border-color: var(--sel);
  }
  .why {
    font-size: 0.75rem;
    color: var(--text-2);
    line-height: 1.35;
    margin: 0 0 10px;
  }
  .size {
    font-family: var(--num);
  }
  .err {
    color: var(--accent);
  }
  .seg button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 0.8125rem;
    margin-bottom: 10px;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--line);
    margin-bottom: 10px;
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 120ms linear;
  }
  .save {
    width: 100%;
    font: 600 0.875rem var(--ui);
    padding: 10px;
    border-radius: 10px;
    border: 0;
    background: var(--sel);
    color: var(--on-sel);
    cursor: pointer;
  }
  .save:disabled {
    opacity: 0.6;
  }
</style>

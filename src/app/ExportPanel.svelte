<script lang="ts">
  // Saving what you typed: a picture of the sheet or a PDF of every page,
  // on its paper or as ink alone. The web version is the free one.
  import type { Tier } from '../export/plan';

  export type StillFormat = 'png' | 'pdf';
  interface Props {
    open: boolean;
    tier: Tier;
    /** px of the long edge each format will come out at */
    sizeFor: (format: StillFormat) => string;
    pages: number;
    onSave: (format: StillFormat, paper: boolean) => Promise<void>;
    onClose: () => void;
  }
  let { open, tier, sizeFor, pages, onSave, onClose }: Props = $props();

  let format = $state<StillFormat>('png');
  let paper = $state(true);
  let busy = $state(false);
  let error = $state('');

  async function save() {
    busy = true;
    error = '';
    try {
      await onSave(format, paper);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Saving failed';
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={onClose}></div>
  <div class="panel" role="dialog" aria-modal="true" aria-labelledby="export-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <header>
      <h2 id="export-title">Save</h2>
      <button type="button" class="close" onclick={onClose} aria-label="Close">×</button>
    </header>
    <div class="field">
      <span>Format</span>
      <div class="seg">
        <button type="button" aria-pressed={format === 'png'} onclick={() => (format = 'png')}>Picture (PNG)</button>
        <button type="button" aria-pressed={format === 'pdf'} onclick={() => (format = 'pdf')}>PDF{pages > 1 ? `, ${pages} pages` : ''}</button>
      </div>
    </div>
    <div class="field">
      <span>Background</span>
      <div class="seg">
        <button type="button" aria-pressed={paper} onclick={() => (paper = true)}>On the paper</button>
        <button type="button" aria-pressed={!paper} onclick={() => (paper = false)}>Ink only</button>
      </div>
      {#if !paper}<p class="why">Transparent, so the type sits on any photo or design.</p>{/if}
    </div>
    <p class="why size">{sizeFor(format)}{format === 'png' && pages > 1 ? ', this page' : ''}</p>
    {#if tier.mark}
      <p class="why">Saved from the web with a small “typed with type[writer]” mark, up to {tier.maxStill} px. The Mac and iPhone apps save at full print size, with no mark.</p>
    {/if}
    {#if error}<p class="why err" role="alert">{error}</p>{/if}
    <button type="button" class="save" onclick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
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

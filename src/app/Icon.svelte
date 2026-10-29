<script lang="ts">
  // One set of line icons, all drawn on the same 20 px grid and stroke.
  type Name = 'dice' | 'perfect' | 'lock' | 'unlock' | 'reroll' | 'page' | 'type' | 'sun' | 'moon' | 'sliders' | 'chevron';
  let { name }: { name: Name } = $props();
</script>

<svg class="icon" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  {#if name === 'dice'}
    <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" /><circle cx="7.2" cy="7.2" r=".9" fill="currentColor" stroke="none" /><circle cx="12.8" cy="12.8" r=".9" fill="currentColor" stroke="none" /><circle cx="10" cy="10" r=".9" fill="currentColor" stroke="none" />
  {:else if name === 'perfect'}
    <circle cx="10" cy="10" r="6.5" /><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" stroke="none" />
  {:else if name === 'lock'}
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  {:else if name === 'unlock'}
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 5.8-1" />
  {:else if name === 'reroll'}
    <path d="M15.5 10a5.5 5.5 0 1 1-1.7-4" /><path d="M14.5 2.8v3.6h-3.6" />
  {:else if name === 'page'}
    <path d="M5.5 2.5h6l3 3v12h-9z" /><path d="M7.5 9h5M7.5 12h5M7.5 15h3" />
  {:else if name === 'type'}
    <path d="M3.5 13.5h13" /><path d="M6 10.5h0M9 10.5h0M12 10.5h0" stroke-width="2" /><path d="M8 16.5h4" />
  {:else if name === 'sun'}
    <circle cx="10" cy="10" r="3.2" /><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
  {:else if name === 'moon'}
    <path d="M15.5 12.2A6 6 0 0 1 7.8 4.5a6 6 0 1 0 7.7 7.7z" />
  {:else if name === 'sliders'}
    <path d="M4 6h12M4 14h12" /><circle cx="8" cy="6" r="1.8" fill="var(--surface-solid)" /><circle cx="12.5" cy="14" r="1.8" fill="var(--surface-solid)" />
  {:else if name === 'chevron'}
    <path d="m6 8 4 4 4-4" />
  {/if}
</svg>

<style>
  .icon {
    width: 18px;
    height: 18px;
    flex: none;
    display: block;
  }
</style>

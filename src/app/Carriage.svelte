<script lang="ts">
  // The moving carriage. 'back' is the platen and knobs (behind the paper),
  // 'front' is the paper bail that holds the sheet (in front of it).
  // 100 units per inch; the platen spans 14.5 inches including knobs.
  import type { MachinePalette } from '../engine/presets';

  interface Props {
    part: 'back' | 'front';
    palette: MachinePalette;
    manual: boolean;
  }
  let { part, palette, manual }: Props = $props();
</script>

{#if part === 'back'}
  <svg viewBox="0 -120 1450 260" aria-hidden="true">
    <defs>
      <linearGradient id="platenGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4a4a4a" />
        <stop offset="0.35" stop-color={palette.platen} />
        <stop offset="1" stop-color="#050505" />
      </linearGradient>
      <linearGradient id="knobGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color={palette.body} />
        <stop offset="1" stop-color={palette.bodyShade} />
      </linearGradient>
      <linearGradient id="leverGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#e9e9e6" />
        <stop offset="1" stop-color="#8f908d" />
      </linearGradient>
    </defs>
    {#if manual}
      <!-- carriage return lever -->
      <path d="M95 18 L40 -80 Q30 -100 8 -96" fill="none" stroke="url(#leverGrad)" stroke-width="16" stroke-linecap="round" />
    {/if}
    <!-- carriage rail -->
    <rect x="40" y="70" width="1370" height="34" rx="10" fill={palette.bodyShade} />
    <!-- platen -->
    <rect x="70" y="-10" width="1310" height="110" rx="26" fill="url(#platenGrad)" />
    <rect x="70" y="2" width="1310" height="10" rx="5" fill="#fff" opacity="0.12" />
    <!-- knobs -->
    {#each [0, 1380] as x}
      <rect {x} y="-26" width="70" height="142" rx="20" fill="url(#knobGrad)" />
      {#each [0, 1, 2, 3, 4, 5] as k}
        <rect x={x + 8 + k * 10} y="-20" width="4" height="130" rx="2" fill="#000" opacity="0.18" />
      {/each}
    {/each}
  </svg>
{:else}
  <svg viewBox="0 -20 1450 60" aria-hidden="true">
    <defs>
      <linearGradient id="bailGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fafaf8" />
        <stop offset="0.5" stop-color="#9c9d9a" />
        <stop offset="1" stop-color="#dcdcd8" />
      </linearGradient>
    </defs>
    <rect x="96" y="0" width="1258" height="9" rx="4.5" fill="url(#bailGrad)" />
    {#each [480, 970] as x}
      <rect {x} y="-9" width="44" height="27" rx="11" fill="#2a2725" />
    {/each}
    <rect x="80" y="-12" width="22" height="34" rx="6" fill={palette.trim} />
    <rect x="1348" y="-12" width="22" height="34" rx="6" fill={palette.trim} />
  </svg>
{/if}

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
</style>

<script lang="ts">
  // The fixed front of the typewriter: ribbon deck, type guide, body and keys.
  // Drawn at 100 units per inch so it lines up with the paper in inches.
  import type { MachinePalette } from '../engine/presets';
  import type { MachineStyle } from '../engine/types';

  interface Props {
    style: MachineStyle;
    palette: MachinePalette;
    /** the key currently pressed (lower-case character, ' ' for space, '\n' for return) */
    pressed: string | null;
    strikeTick: number;
    ribbonColor: string;
  }
  let { style, palette, pressed, strikeTick, ribbonColor }: Props = $props();

  const ROWS = ['1234567890-', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
  const ROW_OFFSET = [0, 34, 52, 82];
  const boxy = $derived(style === 'selectric' || style === 'electronic');
  const electric = $derived(style === 'selectric' || style === 'electronic');
  const pitch = 82;
  const keyR = $derived(boxy ? 27 : 26);

  function keyX(row: number, i: number) {
    const width = (ROWS[0].length - 1) * pitch;
    return 650 - width / 2 + ROW_OFFSET[row] + i * pitch - 20;
  }
  const isPressed = (k: string) => pressed !== null && pressed.toLowerCase() === k;
</script>

<svg class="body" viewBox="0 0 1300 600" aria-hidden="true">
  <defs>
    <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color={palette.body} />
      <stop offset="1" stop-color={palette.bodyShade} />
    </linearGradient>
    <linearGradient id="deckGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color={palette.bodyShade} />
      <stop offset="0.5" stop-color={palette.body} />
      <stop offset="1" stop-color={palette.bodyShade} />
    </linearGradient>
    <radialGradient id="keyGrad" cx="0.4" cy="0.35" r="0.75">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.35" />
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f4f2" />
      <stop offset="0.45" stop-color="#a9aaa8" />
      <stop offset="1" stop-color="#e2e2df" />
    </linearGradient>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity="0.35" />
    </filter>
  </defs>

  <g filter="url(#soft)">
    <!-- ribbon deck -->
    {#if boxy}
      <path d="M95 52 H1205 Q1235 52 1238 86 L1250 170 H50 L62 86 Q65 52 95 52 Z" fill="url(#deckGrad)" />
    {:else}
      <path d="M150 58 Q150 34 190 32 H1110 Q1150 34 1150 58 L1205 170 H95 Z" fill="url(#deckGrad)" />
    {/if}

    <!-- ribbon spools -->
    {#each [290, 1010] as cx}
      <circle {cx} cy="92" r="60" fill={palette.bodyShade} />
      <circle {cx} cy="92" r="50" fill="#141312" />
      <circle {cx} cy="92" r="44" fill="none" stroke={ribbonColor} stroke-width="20" opacity="0.85" />
      <circle {cx} cy="92" r="12" fill="url(#chrome)" />
    {/each}

    <!-- ribbon running across to the type point -->
    <path d="M330 70 Q650 22 970 70" fill="none" stroke={ribbonColor} stroke-width="11" opacity="0.9" />

    <!-- type guide and ribbon vibrator at the printing point -->
    <g class="guide" class:strike={strikeTick % 2 === 1}>
      <path d="M612 14 H688 L668 50 H632 Z" fill="url(#chrome)" stroke="#6c6c6a" stroke-width="2" />
      <rect x="634" y="2" width="32" height="14" rx="2" fill={ribbonColor} />
    </g>

    <!-- body -->
    {#if boxy}
      <rect x="40" y="160" width="1220" height="420" rx="44" fill="url(#bodyGrad)" />
      <rect x="40" y="160" width="1220" height="26" rx="13" fill="#ffffff" opacity="0.08" />
    {:else}
      <path d="M90 160 H1210 Q1258 162 1262 214 L1282 520 Q1286 580 1226 584 H74 Q14 580 18 520 L38 214 Q42 162 90 160 Z" fill="url(#bodyGrad)" />
      <path d="M90 160 H1210 Q1250 162 1256 196 H44 Q50 162 90 160 Z" fill="#ffffff" opacity="0.09" />
    {/if}

    <!-- badge -->
    <text x="650" y="222" text-anchor="middle" class="badge" fill={palette.badge}>{palette.name}</text>
    <rect x="560" y="234" width="180" height="3" rx="1.5" fill={palette.trim} opacity="0.6" />

    <!-- keys -->
    {#each ROWS as row, r}
      {#each row.split('') as k, i}
        {@const x = keyX(r, i)}
        {@const y = 290 + r * 66}
        <g class="key" class:down={isPressed(k)} style="transform-origin: {x}px {y}px">
          {#if !electric}
            <line x1={x} y1={y} x2={x - 6} y2={y - 40} stroke={palette.bodyShade} stroke-width="6" opacity="0.5" />
          {/if}
          {#if boxy}
            <rect x={x - keyR} y={y - keyR} width={keyR * 2} height={keyR * 2 - 4} rx="9" fill={palette.key} stroke={palette.keyRing} stroke-width="3" />
          {:else}
            <circle cx={x} cy={y} r={keyR + 4} fill={palette.keyRing} />
            <circle cx={x} cy={y} r={keyR} fill={palette.key} />
          {/if}
          <circle cx={x} cy={y} r={keyR} fill="url(#keyGrad)" />
          <text x={x} y={y + 9} text-anchor="middle" class="cap" fill={palette.keyText}>{k.toUpperCase()}</text>
        </g>
      {/each}
    {/each}

    <!-- shift keys and return -->
    <g class="key" class:down={pressed === 'shift'} style="transform-origin: 172px 488px">
      <rect x="120" y="462" width="104" height="50" rx="22" fill={palette.key} stroke={palette.keyRing} stroke-width="4" />
      <text x="172" y="494" text-anchor="middle" class="cap small" fill={palette.keyText}>SHIFT</text>
    </g>
    <g class="key" class:down={pressed === '\t'} style="transform-origin: 1128px 356px">
      <rect x="1080" y="330" width="96" height="52" rx="22" fill={palette.key} stroke={palette.keyRing} stroke-width="4" />
      <text x="1128" y="363" text-anchor="middle" class="cap small" fill={palette.keyText}>TAB</text>
    </g>
    {#if electric}
      <g class="key" class:down={pressed === '\n'} style="transform-origin: 1150px 422px">
        <rect x="1096" y="396" width="108" height="52" rx="16" fill={palette.key} stroke={palette.keyRing} stroke-width="4" />
        <text x="1150" y="429" text-anchor="middle" class="cap small" fill={palette.keyText}>RETURN</text>
      </g>
    {/if}

    <!-- space bar -->
    <g class="key" class:down={pressed === ' '} style="transform-origin: 650px 545px">
      <rect x="380" y="525" width="540" height="40" rx="20" fill={palette.key} stroke={palette.keyRing} stroke-width="4" />
      <rect x="380" y="525" width="540" height="14" rx="7" fill="#fff" opacity="0.18" />
    </g>
  </g>
</svg>

<style>
  .body {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .badge {
    font: 600 30px 'Cutive Mono TW', 'Courier New', monospace;
    letter-spacing: 0.32em;
  }
  .cap {
    font: 600 25px 'Cutive Mono TW', 'Courier New', monospace;
    pointer-events: none;
  }
  .cap.small {
    font-size: 17px;
    letter-spacing: 0.08em;
  }
  .key {
    transition: transform 120ms cubic-bezier(0.2, 0.9, 0.3, 1.4);
  }
  .key.down {
    transform: translateY(6px) scale(0.94);
    transition-duration: 30ms;
  }
  .guide {
    transition: transform 90ms ease-out;
  }
  .guide.strike {
    transform: translateY(-3px);
  }
</style>

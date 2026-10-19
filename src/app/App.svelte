<script lang="ts">
  import { onMount } from 'svelte';
  import type { Mode, Settings } from '../engine/types';
  import { defaultSettings, applyPreset, SAMPLE_CAPTION, SAMPLE_LETTER } from '../engine/document';
  import { layoutText } from '../engine/layout';
  import { fontById, loadFont, FONTS } from '../engine/fonts';
  import { PRESETS, presetById, MACHINES } from '../engine/presets';
  import { randomSeed } from '../engine/rng';
  import { isTweaked, resolveFlaws, effectiveFlaws, setFlaw, type FlawKey } from '../engine/flaws';
  import { MACHINE_QUIRKS } from '../engine/quirks';
  import { autoFixes, allFixes, emptyMemory, trackEdit, MARKS, type EditMemory, type Fix } from '../engine/corrections';
  import { strikeoutsFor } from '../engine/timeline';
  import { surpriseLook, perfectOf } from '../engine/surprise';
  import { loadSaved, save } from './storage';
  import Stage from './Stage.svelte';
  import Drawer from './Drawer.svelte';

  const saved = loadSaved();
  let settings = $state<Settings>(saved?.settings ?? defaultSettings());
  let texts = $state<Record<Mode, string>>(saved?.texts ?? { caption: SAMPLE_CAPTION, letter: SAMPLE_LETTER });
  let caretIndex = $state(texts[settings.mode].length);
  let view = $state<'typewriter' | 'page'>('typewriter');
  let drawerOpen = $state(false);
  let presetsOpen = $state(false);
  let fontsReady = $state(false);
  let strikeTick = $state(0);
  // held down: show the same page typed perfectly
  let comparing = $state(false);
  let input: HTMLTextAreaElement;

  let edits = $state<Record<Mode, EditMemory>>(saved?.edits ?? { caption: emptyMemory(), letter: emptyMemory() });
  const text = $derived(texts[settings.mode]);
  const layout = $derived(layoutText(text, settings.mode, settings.layout));
  const preset = $derived(presetById(settings.presetId));
  const isCustom = $derived(
    !preset ||
      JSON.stringify(preset.look) !== JSON.stringify(settings.look) ||
      preset.pitch !== settings.layout.pitch ||
      Math.abs(preset.flawLevel - settings.flaws.master) > 0.005 ||
      Math.abs(preset.ink - settings.flaws.ink) > 0.005 ||
      isTweaked(settings.flaws) ||
      JSON.stringify(settings.quirks) !== JSON.stringify(MACHINE_QUIRKS[preset.look.machine]),
  );
  const amounts = $derived(resolveFlaws(settings.flaws, settings.look.machine));
  // Every correction on the page: random typos plus your own backspaces.
  const allTheFixes = $derived(
    allFixes(autoFixes(layout, settings.seed, effectiveFlaws(settings.flaws, settings.look.machine, settings.artistic).typos), settings.corrections.keepBackspaces ? edits[settings.mode].fixes : [], text),
  );
  // X-outs and strikethroughs leave the wrong word on the page, so they
  // change the layout; the other styles fix letters in place.
  const mark = $derived(MARKS[settings.corrections.style]);
  const outs = $derived(mark ? strikeoutsFor(text, allTheFixes, settings.seed, mark) : []);
  const typedLayout = $derived(outs.length ? layoutText(text, settings.mode, settings.layout, outs) : layout);
  const fixes = $derived(mark ? new Map<number, Fix>() : allTheFixes);

  const shown = $derived(comparing ? perfectOf(settings) : settings);
  const shownFixes = $derived(comparing ? new Map() : fixes);

  // The four flaws that change the page most, kept on screen.
  const DIALS: { key: FlawKey | 'ink'; label: string }[] = [
    { key: 'ink', label: 'Ink' },
    { key: 'overink', label: 'Blots' },
    { key: 'baseline', label: 'Wobble' },
    { key: 'quirks', label: 'Key quirks' },
  ];
  function setDial(key: FlawKey | 'ink', v: number) {
    settings.flaws = key === 'ink' ? { ...settings.flaws, ink: v } : setFlaw(settings.flaws, key, v, settings.look.machine);
  }
  const masterWord = $derived(
    settings.flaws.master < 0.12 ? 'Pro typist' : settings.flaws.master < 0.35 ? 'Practiced' : settings.flaws.master < 0.6 ? 'Hobbyist' : settings.flaws.master < 0.85 ? 'Rusty' : 'First timer',
  );

  // Fonts load per typeface; the default one first, the rest in the background.
  $effect(() => {
    const def = fontById(settings.look.fontId);
    fontsReady = false;
    let live = true;
    loadFont(def)
      .then(() => live && (fontsReady = true))
      .catch(() => live && (fontsReady = true));
    return () => (live = false);
  });
  onMount(() => {
    setTimeout(() => FONTS.forEach((f) => loadFont(f).catch(() => {})), 2500);
    focusInput();
  });

  $effect(() => {
    save({ settings: $state.snapshot(settings), texts: $state.snapshot(texts), edits: $state.snapshot(edits) });
  });

  function focusInput() {
    input?.focus({ preventScroll: true });
  }
  function syncCaret() {
    if (input) caretIndex = input.selectionEnd ?? input.value.length;
  }
  function setCaret(i: number) {
    caretIndex = i;
    if (input) {
      input.focus({ preventScroll: true });
      input.setSelectionRange(i, i);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Tab') {
      // a typewriter tab, not a jump to the next button
      e.preventDefault();
      input.setRangeText('\t', input.selectionStart, input.selectionEnd, 'end');
      onInput();
    }
    if (e.key === 'Tab' || e.key === 'Enter' || e.key.length === 1) strikeTick++;
  }
  function onInput() {
    edits[settings.mode] = trackEdit(edits[settings.mode], texts[settings.mode], input.value);
    texts[settings.mode] = input.value;
    syncCaret();
  }

  function setMode(m: Mode) {
    if (m === settings.mode) return;
    settings.mode = m;
    caretIndex = texts[m].length;
    queueMicrotask(() => setCaret(texts[m].length));
  }
  function choosePreset(id: string) {
    settings = applyPreset(settings, id);
    presetsOpen = false;
    focusInput();
  }
  function reroll() {
    settings.seed = randomSeed();
  }
  function surprise() {
    const next = surpriseLook(settings, randomSeed());
    settings = settings.seedLocked ? { ...next, seed: settings.seed } : next;
  }
  function resetDial(key: FlawKey | 'ink') {
    if (key === 'ink') settings.flaws = { ...settings.flaws, ink: preset?.ink ?? 0.5 };
    else settings.flaws = { ...settings.flaws, offsets: { ...settings.flaws.offsets, [key]: undefined } };
  }
</script>

<div class="app">
  <header class="top">
    <div class="brand">
      <span class="mark" aria-hidden="true">◐</span>
      <span>Typewriter</span>
    </div>
    <div class="seg" role="group" aria-label="Mode">
      <button type="button" aria-pressed={settings.mode === 'caption'} onclick={() => setMode('caption')}>Caption</button>
      <button type="button" aria-pressed={settings.mode === 'letter'} onclick={() => setMode('letter')}>Letter</button>
    </div>
    <div class="spacer"></div>
    <div class="tools">
      <button type="button" class="tool" onclick={surprise} aria-label="Surprise me" title="A whole new look: machine, typeface, paper, ink and flaws">🎲<span class="long"> Surprise me</span></button>
      <button
        type="button"
        class="tool"
        aria-pressed={comparing}
        aria-label="Hold for perfect" title="Hold to see the same page typed perfectly"
        onpointerdown={(e) => {
          e.preventDefault();
          comparing = true;
        }}
        onpointerup={() => (comparing = false)}
        onpointerleave={() => (comparing = false)}
        onpointercancel={() => (comparing = false)}
        onkeydown={(e) => (e.key === ' ' || e.key === 'Enter') && (comparing = true)}
        onkeyup={() => (comparing = false)}
        oncontextmenu={(e) => e.preventDefault()}><svg class="half" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" /></svg><span class="long"> Hold for perfect</span></button
      >
    </div>

    <button
      type="button"
      class="chip"
      aria-pressed={view === 'page'}
      onclick={() => {
        view = view === 'page' ? 'typewriter' : 'page';
        focusInput();
      }}><span class="long">{view === 'page' ? 'Back to typing' : 'See the page'}</span><span class="short">{view === 'page' ? 'Type' : 'Page'}</span></button
    >
    <button type="button" class="chip" aria-expanded={drawerOpen} onclick={() => (drawerOpen = !drawerOpen)}>Adjust</button>
  </header>

  <Stage
    layout={comparing ? layout : typedLayout}
    settings={shown}
    {text}
    {caretIndex}
    {view}
    {fontsReady}
    {strikeTick}
    fixes={shownFixes}
    onCaretRequest={setCaret}
    onFocusRequest={focusInput}
  />

  <footer class="bottom">
    <div class="presets">
      <button type="button" class="preset-btn" aria-expanded={presetsOpen} onclick={() => (presetsOpen = !presetsOpen)}>
        <span class="dot" style="--c:{MACHINES[settings.look.machine].body}"></span>
        <span class="pname">{!preset || preset.look.machine !== settings.look.machine ? 'Your own look' : preset.name + (isCustom ? ' · custom' : '')}</span>
        <span class="caret-down" aria-hidden="true">▾</span>
      </button>
      {#if presetsOpen}
        <ul class="preset-list" role="listbox" aria-label="Presets">
          {#each PRESETS as p}
            <li>
              <button type="button" role="option" aria-selected={p.id === settings.presetId} onclick={() => choosePreset(p.id)}>
                <span class="dot" style="--c:{MACHINES[p.look.machine].body}"></span>
                <span class="ptext"><b>{p.name}</b><small>{p.blurb}</small></span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <label class="master">
      <span class="label">Pro</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={settings.flaws.master}
        oninput={(e) => (settings.flaws = { ...settings.flaws, master: +e.currentTarget.value })}
        onchange={focusInput}
        aria-label="Pro typist to first timer"
        aria-valuetext={masterWord}
      />
      <span class="label">First timer</span>
      <output>{masterWord}</output>
    </label>

    <div class="dials">
      {#each DIALS as d}
        <label class="dial">
          <span class="label">{d.label}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={d.key === 'ink' ? settings.flaws.ink : amounts[d.key]}
            oninput={(e) => setDial(d.key, +e.currentTarget.value)}
            ondblclick={() => resetDial(d.key)}
            onchange={focusInput}
            aria-label={d.label}
          />
        </label>
      {/each}
    </div>

    <div class="seed" title="The seed makes a look repeatable. Lock it to keep this exact page.">
      <span class="label">Seed</span>
      <input
        type="number"
        min="1"
        max="99999"
        value={settings.seed}
        onchange={(e) => (settings.seed = Math.max(1, Math.round(+e.currentTarget.value) || 1))}
        aria-label="Seed"
      />
      <button
        type="button"
        class="icon"
        aria-pressed={settings.seedLocked}
        aria-label={settings.seedLocked ? 'Unlock seed' : 'Lock seed'}
        onclick={() => (settings.seedLocked = !settings.seedLocked)}>{settings.seedLocked ? '🔒' : '🔓'}</button
      >
      <button type="button" class="icon" disabled={settings.seedLocked} onclick={reroll} aria-label="Reroll">⟳</button>
    </div>
  </footer>

  <textarea
    bind:this={input}
    class="hidden-input"
    value={text}
    oninput={onInput}
    onkeydown={onKeydown}
    onkeyup={syncCaret}
    onselect={syncCaret}
    onclick={syncCaret}
    autocapitalize="sentences"
    autocomplete="off"
    spellcheck="false"
    aria-label="Type here"
  ></textarea>

  <Drawer
    {settings}
    open={drawerOpen}
    onChange={(s) => (settings = s)}
    onClose={() => {
      drawerOpen = false;
      focusInput();
    }}
    onResetPreset={() => choosePreset(settings.presetId)}
  />
</div>

<style>
  .app {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }
  .app > :global(.stage) {
    position: absolute;
    inset: 0;
  }
  .top,
  .bottom {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    color: var(--chrome-ink);
    position: absolute;
    left: 0;
    right: 0;
    z-index: 5;
    flex-wrap: wrap;
    pointer-events: none;
  }
  .top > *,
  .bottom > * {
    pointer-events: auto;
  }
  .top {
    top: 0;
    background: linear-gradient(180deg, rgba(20, 13, 8, 0.55), transparent);
    padding-top: max(10px, env(safe-area-inset-top));
  }
  .bottom {
    bottom: 0;
    background: linear-gradient(0deg, rgba(20, 13, 8, 0.7), transparent);
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    justify-content: space-between;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 600 20px var(--display);
    letter-spacing: 0.02em;
  }
  .mark {
    color: var(--accent);
  }
  .spacer {
    flex: 1;
  }
  .seg {
    display: flex;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 999px;
    padding: 3px;
  }
  .seg button {
    font: 500 14px var(--ui);
    color: var(--chrome-ink);
    background: none;
    border: 0;
    border-radius: 999px;
    padding: 7px 14px;
    cursor: pointer;
  }
  .seg button[aria-pressed='true'] {
    background: var(--paper);
    color: var(--ink);
  }
  .chip,
  .preset-btn {
    font: 500 14px var(--ui);
    color: var(--chrome-ink);
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    padding: 8px 14px;
    cursor: pointer;
  }
  .presets {
    position: relative;
  }
  .preset-btn {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
    flex: none;
  }
  .preset-list {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    list-style: none;
    margin: 0;
    padding: 6px;
    width: min(320px, calc(100vw - 32px));
    max-height: 60vh;
    overflow: auto;
    background: var(--panel);
    border-radius: 12px;
    box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.6);
  }
  .preset-list button {
    display: flex;
    gap: 10px;
    align-items: center;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    border-radius: 8px;
    padding: 9px 10px;
    cursor: pointer;
    color: var(--ink);
  }
  .preset-list button:hover,
  .preset-list button[aria-selected='true'] {
    background: var(--chip);
  }
  .preset-list .dot {
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  }
  .ptext {
    display: grid;
  }
  .ptext b {
    font: 600 15px var(--ui);
  }
  .ptext small {
    font-size: 13px;
    color: var(--muted);
  }
  .master {
    flex: 1 1 260px;
    max-width: 520px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 10px;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 18px;
    padding: 6px 16px 4px;
  }
  .master input {
    width: 100%;
    accent-color: var(--accent);
  }
  .master output {
    grid-column: 1 / -1;
    text-align: center;
    font: 13px var(--mono);
    opacity: 0.9;
  }
  .dials {
    display: flex;
    gap: 12px;
    flex: 1 1 360px;
    max-width: 560px;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 18px;
    padding: 8px 14px 6px;
  }
  .dial {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .dial .label {
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dial input {
    width: 100%;
    accent-color: var(--accent);
  }
  .tools {
    display: flex;
    gap: 6px;
  }
  .tool {
    font: 500 14px var(--ui);
    line-height: 1.2;
    color: var(--chrome-ink);
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    padding: 8px 13px;
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }
  .tool .half {
    width: 15px;
    height: 15px;
    vertical-align: -2px;
  }
  .tool[aria-pressed='true'] {
    background: var(--paper);
    color: var(--ink);
  }
  .seed {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 999px;
    padding: 4px 6px 4px 14px;
  }
  .label {
    font: 12px var(--mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
  }
  .seed input {
    width: 64px;
    font: 15px var(--mono);
    color: var(--chrome-ink);
    background: none;
    border: 0;
    text-align: center;
  }
  .icon {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 0;
    background: rgba(255, 255, 255, 0.1);
    color: var(--chrome-ink);
    font-size: 16px;
    cursor: pointer;
  }
  .icon:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .hidden-input {
    position: fixed;
    left: 0;
    top: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    border: 0;
    padding: 0;
    resize: none;
    font-size: 16px; /* stops iOS zooming on focus */
    pointer-events: none;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .short {
    display: none;
  }
  @media (max-width: 700px) {
    .bottom {
      flex-wrap: wrap;
    }
    .master,
    .dials {
      flex-basis: 100%;
      max-width: none;
    }
    .master {
      order: -2;
    }
    .dials {
      order: -1;
    }
  }
  @media (max-width: 560px) {
    .brand {
      display: none;
    }
    .top {
      flex-wrap: nowrap;
      gap: 8px;
    }
    .bottom {
      gap: 8px;
    }
    .long {
      display: none;
    }
    .short {
      display: inline;
    }
    .seed .label {
      display: none;
    }
    .presets {
      flex: 1;
      min-width: 0;
    }
    .preset-btn {
      max-width: 100%;
    }
    .pname {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .seed input {
      width: 52px;
    }
    .seed {
      padding-left: 6px;
    }
    .seed input {
      width: 60px;
    }
    .pname {
      max-width: 34vw;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chip {
      padding: 7px 11px;
      font-size: 13px;
    }
    .top .seg button {
      padding: 7px 11px;
    }
    .tools {
      gap: 4px;
    }
    .tool {
      padding: 7px 10px;
    }
  }
  @media (max-width: 400px) {
    .top {
      padding-left: 10px;
      padding-right: 10px;
      gap: 6px;
    }
    .top .seg button {
      padding: 7px 9px;
      font-size: 13px;
    }
    .chip {
      padding: 7px 9px;
    }
  }
</style>

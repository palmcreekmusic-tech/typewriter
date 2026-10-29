<script lang="ts">
  // Every control, tucked away. A jump bar at the top gets you to each part;
  // any slider you've moved shows a ↺ to put it back where the Typist or Machine slider has it.
  import type { Settings, PaperKind } from '../engine/types';
  import { FONTS } from '../engine/fonts';
  import { INK_COLOURS, SECOND_COLOURS } from '../engine/surprise';
  import { FLAWS, resolveFlaws, setFlaw, cantDo, type FlawKey } from '../engine/flaws';
  import { MACHINE_QUIRKS, QUIRK_KINDS, surpriseQuirks, type Quirk } from '../engine/quirks';
  import { randomSeed } from '../engine/rng';
  import { FIX_STYLES, type CorrectionSettings } from '../engine/corrections';
  import { mechanism } from '../engine/flaws';
  import { sound, setSoundOn, setSoundPack, setSoundVolume } from './sound.svelte';

  interface Props {
    settings: Settings;
    open: boolean;
    onChange: (s: Settings) => void;
    onClose: () => void;
    onResetPreset: () => void;
  }
  let { settings, open, onChange, onClose, onResetPreset }: Props = $props();

  const PAPERS: [PaperKind, string][] = [
    ['bond', 'Bond'],
    ['cream', 'Cream'],
    ['aged', 'Aged'],
    ['onionskin', 'Onionskin'],
    ['newsprint', 'Newsprint'],
    ['sticky', 'Sticky note'],
  ];
  const amounts = $derived(resolveFlaws(settings.flaws, settings.look.machine));
  const SECTIONS = [
    ['type', 'Type'],
    ['ink', 'Ink'],
    ['typist', 'Typist'],
    ['machine', 'Machine'],
    ['paper', 'Paper'],
    ['mistakes', 'Mistakes'],
    ['layout', 'Layout'],
    ['sound', 'Sound'],
  ] as const;
  let scroller: HTMLElement;
  let current = $state('type');
  function jump(id: string) {
    const el = scroller.querySelector(`#adj-${id}`) as HTMLElement | null;
    if (el) scroller.scrollTo({ top: el.offsetTop - 104, behavior: 'smooth' });
  }
  function onScroll() {
    let at: string = SECTIONS[0][0];
    for (const [id] of SECTIONS) {
      const el = scroller.querySelector(`#adj-${id}`) as HTMLElement | null;
      if (el && el.offsetTop - 120 <= scroller.scrollTop) at = id;
    }
    current = at;
  }

  const flawsIn = (group: string) => FLAWS.filter((f) => f.group === group && f.key !== 'typos' && (f.key !== 'twotone' || settings.look.inkColor2));
  const moved = (key: FlawKey) => Math.abs(settings.flaws.offsets[key] ?? 0) >= 0.005;
  function flaw(key: FlawKey, v: number) {
    onChange({ ...settings, flaws: setFlaw(settings.flaws, key, v, settings.look.machine) });
  }
  function unflaw(key: FlawKey) {
    onChange({ ...settings, flaws: { ...settings.flaws, offsets: { ...settings.flaws.offsets, [key]: undefined } } });
  }
  const foldWord = (v: number) => (v < 0.02 ? 'flat' : v <= 0.6 ? 'in thirds' : 'thirds and half');
  function inkLevel(v: number) {
    onChange({ ...settings, flaws: { ...settings.flaws, ink: v } });
  }
  const inkWord = (v: number) => (v < 0.2 ? 'nearly dry' : v < 0.4 ? 'worn' : v < 0.62 ? 'healthy' : v < 0.82 ? 'fresh' : 'soaked');

  function setQuirks(list: Quirk[]) {
    onChange({ ...settings, quirks: list });
  }
  function editQuirk(i: number, patch: Partial<Quirk>) {
    setQuirks(settings.quirks.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }
  function addQuirk() {
    setQuirks([...settings.quirks, { ch: 'e', kind: 'faint', amount: 0.6 }]);
  }

  function fix<K extends keyof CorrectionSettings>(k: K, v: CorrectionSettings[K]) {
    onChange({ ...settings, corrections: { ...settings.corrections, [k]: v } });
  }
  const FIX_SLIDERS: { key: 'mess' | 'showThrough' | 'rush' | 'age'; label: string; lo: string; hi: string }[] = [
    { key: 'mess', label: 'Mess', lo: 'neat dab', hi: 'sloppy blob' },
    { key: 'showThrough', label: 'Show-through', lo: 'fully covered', hi: 'old letter shows' },
    { key: 'rush', label: 'Patience', lo: 'waited to dry', hi: 'typed while wet' },
    { key: 'age', label: 'Age', lo: 'fresh', hi: 'yellowed, cracked' },
  ];
  const sliderWord = (v: number, lo: string, hi: string) => (v < 0.34 ? lo : v > 0.66 ? hi : 'some');
  const isPreset = (c: string, list: [string, string][]) => list.some(([x]) => x === c);

  function look<K extends keyof Settings['look']>(k: K, v: Settings['look'][K]) {
    onChange({ ...settings, look: { ...settings.look, [k]: v } });
  }
  function layout<K extends keyof Settings['layout']>(k: K, v: Settings['layout'][K]) {
    onChange({ ...settings, layout: { ...settings.layout, [k]: v } });
  }
</script>

<aside class="drawer" class:open aria-hidden={!open} inert={!open} bind:this={scroller} onscroll={onScroll}>
  <header>
    <div class="head">
      <h2>Adjust</h2>
      <button type="button" class="close" onclick={onClose} aria-label="Close">×</button>
    </div>
    <nav class="jump" aria-label="Sections">
      {#each SECTIONS as [id, name]}
        <button type="button" aria-current={current === id} onclick={() => jump(id)}>{name}</button>
      {/each}
    </nav>
  </header>

  {#snippet flawSlider(key: FlawKey, label: string, value: string)}
    {@const cant = settings.artistic ? undefined : cantDo(key, settings.look.machine)}
    <label class="field" class:off={!!cant} title={cant}>
      <span
        >{label}
        <span class="val">
          {#if moved(key)}<button type="button" class="undo" title="Back to where the Typist or Machine slider puts it" aria-label="Reset {label}" onclick={(e) => (e.preventDefault(), unflaw(key))}>↺</button>{/if}
          <output class:moved={moved(key)}>{value}</output>
        </span></span
      >
      <input type="range" min="0" max="1" step="0.01" value={amounts[key]} disabled={!!cant} oninput={(e) => flaw(key, +e.currentTarget.value)} ondblclick={() => unflaw(key)} />
      {#if cant}<small class="why">Not on this machine. {cant}</small>{/if}
    </label>
  {/snippet}

  <section class="mode">
    <div class="seg">
      <button type="button" aria-pressed={!settings.artistic} onclick={() => onChange({ ...settings, artistic: false })}>Realistic</button>
      <button type="button" aria-pressed={settings.artistic} onclick={() => onChange({ ...settings, artistic: true })}>Artistic</button>
    </div>
    <p class="note">
      {settings.artistic
        ? 'Every flaw goes all the way, on any machine. Push it as far as you like.'
        : 'Flaws stay within what a real typist, ribbon and machine could do, and each machine only shows the faults it can have.'}
    </p>
  </section>

  <section id="adj-type">
    <h3>Type</h3>
    <label class="field">
      <span>Typeface</span>
      <select value={settings.look.fontId} onchange={(e) => look('fontId', e.currentTarget.value)}>
        {#each FONTS as f}
          <option value={f.id}>{f.label}</option>
        {/each}
      </select>
    </label>
    <div class="field">
      <span>Pitch</span>
      <div class="seg">
        <button type="button" aria-pressed={settings.layout.pitch === 10} onclick={() => layout('pitch', 10)}>Pica · 10</button>
        <button type="button" aria-pressed={settings.layout.pitch === 12} onclick={() => layout('pitch', 12)}>Elite · 12</button>
      </div>
    </div>
  </section>

  <section id="adj-ink">
    <h3>Ink and ribbon</h3>
    <div class="field">
      <span>Ink colour</span>
      <div class="swatches">
        {#each INK_COLOURS as [c, name]}
          <button type="button" class="swatch" style="--c:{c}" aria-pressed={settings.look.inkColor === c} aria-label={name} title={name} onclick={() => look('inkColor', c)}></button>
        {/each}
        <label class="swatch picker" style="--c:{settings.look.inkColor}" title="Any colour" aria-pressed={!isPreset(settings.look.inkColor, INK_COLOURS)}>
          <input type="color" value={settings.look.inkColor} oninput={(e) => look('inkColor', e.currentTarget.value)} aria-label="Pick any ink colour" />
        </label>
      </div>
    </div>
    <div class="field">
      <span>Two-colour ribbon</span>
      <div class="swatches">
        <button type="button" class="swatch none" aria-pressed={!settings.look.inkColor2} aria-label="One colour" title="One colour" onclick={() => look('inkColor2', '')}></button>
        {#each SECOND_COLOURS as [c, name]}
          <button type="button" class="swatch half" style="--c:{settings.look.inkColor};--c2:{c}" aria-pressed={settings.look.inkColor2 === c} aria-label={name} title="{name} on the bottom half" onclick={() => look('inkColor2', c)}></button>
        {/each}
        <label class="swatch picker half" style="--c:{settings.look.inkColor};--c2:{settings.look.inkColor2 || '#b0302a'}" title="Any second colour" aria-pressed={!!settings.look.inkColor2 && !isPreset(settings.look.inkColor2, SECOND_COLOURS)}>
          <input type="color" value={settings.look.inkColor2 || '#b0302a'} oninput={(e) => look('inkColor2', e.currentTarget.value)} aria-label="Pick any second colour" />
        </label>
      </div>
    </div>
    <div class="field">
      <span>Ribbon</span>
      <div class="seg">
        <button type="button" aria-pressed={settings.look.ribbon === 'fabric'} onclick={() => look('ribbon', 'fabric')}>Fabric</button>
        <button type="button" aria-pressed={settings.look.ribbon === 'film'} onclick={() => look('ribbon', 'film')}>Carbon film</button>
        <button type="button" aria-pressed={settings.look.ribbon === 'carbon'} onclick={() => look('ribbon', 'carbon')}>Carbon copy</button>
      </div>
    </div>
    <label class="field">
      <span>Ribbon ink <output>{inkWord(settings.flaws.ink)}</output></span>
      <input type="range" min="0" max="1" step="0.01" value={settings.flaws.ink} oninput={(e) => inkLevel(+e.currentTarget.value)} />
    </label>
    {#each flawsIn('Ink') as f}
      {@render flawSlider(f.key, f.label, String(Math.round(amounts[f.key] * 100)))}
    {/each}
  </section>

  <section id="adj-typist">
    <h3>The typist</h3>
    {#each flawsIn('Typist') as f}
      {@render flawSlider(f.key, f.label, String(Math.round(amounts[f.key] * 100)))}
    {/each}
  </section>

  <section id="adj-machine">
    <h3>The machine</h3>
    {#each flawsIn('Machine') as f}
      {@render flawSlider(f.key, f.label, String(Math.round(amounts[f.key] * 100)))}
    {/each}
    <div class="quirks">
      <span class="sub">This machine's keys</span>
      {#each settings.quirks as q, i}
        <div class="quirk">
          <input
            class="key"
            type="text"
            maxlength="1"
            value={q.ch}
            aria-label="Key"
            oninput={(e) => e.currentTarget.value && editQuirk(i, { ch: e.currentTarget.value.slice(-1) })}
          />
          <select value={q.kind} aria-label="What's wrong" onchange={(e) => editQuirk(i, { kind: e.currentTarget.value as Quirk['kind'] })}>
            {#each QUIRK_KINDS as k}
              <option value={k.kind}>{k.label}</option>
            {/each}
          </select>
          <input type="range" min="0.05" max="1" step="0.01" value={q.amount} aria-label="How much" oninput={(e) => editQuirk(i, { amount: +e.currentTarget.value })} />
          <button type="button" class="x" aria-label="Remove" onclick={() => setQuirks(settings.quirks.filter((_, j) => j !== i))}>×</button>
        </div>
      {:else}
        <p class="note">No damaged keys. Every letter prints the same.</p>
      {/each}
      <div class="seg wrap">
        <button type="button" onclick={addQuirk}>Add a key</button>
        <button type="button" onclick={() => setQuirks(surpriseQuirks(randomSeed()))}>Surprise me</button>
        <button type="button" onclick={() => setQuirks(MACHINE_QUIRKS[settings.look.machine].map((q) => ({ ...q })))}>Machine's own</button>
      </div>
    </div>
  </section>

  <section id="adj-paper">
    <h3>Paper</h3>
    <div class="field">
      <span>Stock</span>
      <div class="seg wrap">
        {#each PAPERS as [k, name]}
          <button type="button" aria-pressed={settings.look.paper === k} onclick={() => look('paper', k)}>{name}</button>
        {/each}
      </div>
    </div>
    <label class="field">
      <span>Warmth <output>{Math.round(settings.look.paperTone * 100)}</output></span>
      <input type="range" min="0" max="1" step="0.01" value={settings.look.paperTone} oninput={(e) => look('paperTone', +e.currentTarget.value)} />
    </label>
    {#each flawsIn('Paper') as f}
      {@render flawSlider(f.key, f.label, f.key === 'folds' ? foldWord(amounts.folds) : String(Math.round(amounts[f.key] * 100)))}
    {/each}
  </section>

  <section id="adj-mistakes">
    <h3>Mistakes and corrections</h3>
    <label class="field">
      <span>Fixed with</span>
      <select value={settings.corrections.style} onchange={(e) => fix('style', e.currentTarget.value as CorrectionSettings['style'])}>
        {#each FIX_STYLES as f}
          <option value={f.style}>{f.label}</option>
        {/each}
      </select>
    </label>
    {@render flawSlider('typos', 'Random typos', String(Math.round(amounts.typos * 100)))}
    <label class="check">
      <input type="checkbox" checked={settings.corrections.keepBackspaces} onchange={(e) => fix('keepBackspaces', e.currentTarget.checked)} />
      <span>Keep my backspaces: retyping a letter corrects it instead of erasing it</span>
    </label>
    {#each FIX_SLIDERS as f}
      <label class="field">
        <span>{f.label} <output>{sliderWord(settings.corrections[f.key], f.lo, f.hi)}</output></span>
        <input type="range" min="0" max="1" step="0.01" value={settings.corrections[f.key]} oninput={(e) => fix(f.key, +e.currentTarget.value)} />
      </label>
    {/each}
  </section>

  <section id="adj-layout">
    <h3>Layout</h3>
    {#if settings.mode === 'caption'}
      <label class="field">
        <span>Line length <output>{settings.layout.captionWidth} characters</output></span>
        <input type="range" min="12" max="80" step="1" value={settings.layout.captionWidth} oninput={(e) => layout('captionWidth', +e.currentTarget.value)} />
      </label>
    {:else}
      <div class="field">
        <span>Paper size</span>
        <div class="seg">
          <button type="button" aria-pressed={settings.layout.paperSize === 'letter'} onclick={() => layout('paperSize', 'letter')}>US Letter</button>
          <button type="button" aria-pressed={settings.layout.paperSize === 'a4'} onclick={() => layout('paperSize', 'a4')}>A4</button>
        </div>
      </div>
      <label class="field">
        <span>Left margin <output>{settings.layout.marginLeft.toFixed(2)} in</output></span>
        <input type="range" min="0.5" max="2.5" step="0.05" value={settings.layout.marginLeft} oninput={(e) => layout('marginLeft', +e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>Right margin <output>{settings.layout.marginRight.toFixed(2)} in</output></span>
        <input type="range" min="0.5" max="2.5" step="0.05" value={settings.layout.marginRight} oninput={(e) => layout('marginRight', +e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>Top margin <output>{settings.layout.marginTop.toFixed(2)} in</output></span>
        <input type="range" min="0.5" max="3" step="0.05" value={settings.layout.marginTop} oninput={(e) => layout('marginTop', +e.currentTarget.value)} />
      </label>
    {/if}
    <div class="field">
      <span>Line spacing</span>
      <div class="seg">
        {#each [1, 1.5, 2] as v}
          <button type="button" aria-pressed={settings.layout.lineSpacing === v} onclick={() => layout('lineSpacing', v as 1 | 1.5 | 2)}>{v}</button>
        {/each}
      </div>
    </div>
  </section>

  <section id="adj-sound">
    <h3>Sound</h3>
    <label class="check">
      <input type="checkbox" checked={sound.on} onchange={(e) => setSoundOn(e.currentTarget.checked)} />
      <span>Play sounds as you type and in Play</span>
    </label>
    <div class="field">
      <span>Voice</span>
      <div class="seg wrap">
        <button type="button" aria-pressed={!sound.pack} onclick={() => setSoundPack('')}>Synthesised</button>
        {#each sound.packs as p}
          <button type="button" aria-pressed={sound.pack === p.id} onclick={() => setSoundPack(p.id)}>{p.name}</button>
        {/each}
      </div>
    </div>
    {#if sound.pack}
      {@const p = sound.packs.find((x) => x.id === sound.pack)}
      {#if p && (p.mechanism ?? 'typebar') !== mechanism(settings.look.machine)}
        <p class="why">This pack was recorded on a different kind of machine, so this one keeps its synthesised voice.</p>
      {/if}
      {#if p?.credits}<p class="why">{p.credits}</p>{/if}
    {:else}
      <p class="why">Made on the fly for each machine, so no two strikes are quite the same.</p>
    {/if}
    <label class="field">
      <span>Volume <output>{Math.round(sound.volume * 100)}</output></span>
      <input type="range" min="0" max="1" step="0.01" value={sound.volume} oninput={(e) => setSoundVolume(+e.currentTarget.value)} />
    </label>
  </section>

  <section>
    <button type="button" class="reset" onclick={onResetPreset}>Reset to preset</button>
    <p class="note">Every slider remembers how far you moved it from the Typist or Machine slider, so you can still move those afterwards. Typist flaws follow Typist; ink, machine and paper grain follow Machine. A ↺ (or a double-click on the slider) puts one back. Key quirks belong to the machine, so they stay put when you reroll.</p>
  </section>
</aside>

<style>
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(360px, 100vw);
    background: var(--surface-solid);
    color: var(--text);
    border-left: var(--hair) solid var(--line);
    box-shadow: -12px 0 30px -18px rgba(var(--shadow), 0.4);
    transform: translateX(105%);
    transition: transform 280ms cubic-bezier(0.3, 0.8, 0.2, 1);
    overflow-y: auto;
    z-index: 20;
    padding: 0 18px 32px;
  }
  .drawer.open {
    transform: none;
  }
  /* room to scroll the last section up to the top */
  .drawer::after {
    content: '';
    display: block;
    height: 35vh;
  }
  header {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface-solid);
    padding: max(12px, env(safe-area-inset-top)) 0 0;
    margin: 0 -18px;
    padding-inline: 18px;
    border-bottom: var(--hair) solid var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .jump {
    display: flex;
    gap: 14px;
    margin-top: 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .jump::-webkit-scrollbar {
    display: none;
  }
  .jump button {
    font: 500 0.8125rem var(--ui);
    padding: 6px 0 8px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--text-2);
    cursor: pointer;
    white-space: nowrap;
  }
  .jump button[aria-current='true'] {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .val {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .mode {
    margin-top: 14px;
  }
  .mode .note {
    margin: 8px 0 0;
  }
  .field.off > span {
    opacity: 0.5;
  }
  .why {
    font-size: 0.75rem;
    color: var(--text-2);
    line-height: 1.35;
  }
  input[type='range']:disabled {
    opacity: 0.35;
  }
  output.moved {
    color: var(--accent);
    font-weight: 600;
  }
  .undo {
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 15px;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
  }
  h2 {
    font: 600 1.0625rem var(--ui);
    margin: 0;
  }
  h3 {
    font: 600 0.75rem var(--ui);
    color: var(--text-2);
    margin: 22px 0 10px;
    padding-top: 14px;
    border-top: var(--hair) solid var(--line);
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
    margin-bottom: 14px;
    font-size: 0.8125rem;
  }
  .field > span {
    display: flex;
    justify-content: space-between;
    color: var(--text-2);
  }
  output {
    font: 0.75rem var(--ui);
    color: var(--text);
  }
  select {
    font: inherit;
    padding: 7px 8px;
    border-radius: 8px;
    border: var(--hair) solid var(--line);
    background: var(--surface-2);
    color: var(--text);
  }
  input[type='range'] {
    width: 100%;
  }
  .seg {
    display: flex;
    gap: 6px;
  }
  .seg.wrap {
    flex-wrap: wrap;
  }
  .seg button,
  .reset {
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
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }
  .swatch.half {
    background: linear-gradient(180deg, var(--c) 50%, var(--c2) 50%);
  }
  .swatch.none {
    background: linear-gradient(135deg, transparent 45%, var(--text-2) 46%, var(--text-2) 54%, transparent 55%), var(--surface-2);
  }
  .swatch.picker {
    position: relative;
    background: conic-gradient(#c33, #cc3, #3c6, #3cc, #36c, #c3c, #c33);
    display: grid;
    place-items: center;
  }
  .swatch.picker::after {
    content: '';
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--c2, var(--c));
    box-shadow: 0 0 0 2px var(--surface-solid);
  }
  .swatch.picker input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  .swatch {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--c);
    border: 2px solid var(--surface-solid);
    box-shadow: 0 0 0 1px var(--line);
    cursor: pointer;
  }
  .swatch[aria-pressed='true'],
  .swatch.picker:has(input:focus-visible) {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .reset {
    width: 100%;
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 0.8125rem;
    color: var(--text-2);
    margin-bottom: 14px;
    line-height: 1.35;
  }
  .check input {
    margin-top: 2px;
    accent-color: var(--accent);
  }
  .quirks {
    display: grid;
    gap: 8px;
    margin: 4px 0 14px;
  }
  .sub {
    font-size: 0.8125rem;
    color: var(--text-2);
  }
  .quirk {
    display: grid;
    grid-template-columns: 38px 1fr 70px 28px;
    gap: 6px;
    align-items: center;
  }
  .quirk .key {
    font: 1.0625rem var(--num);
    text-align: center;
    padding: 5px 0;
    border-radius: 8px;
    border: var(--hair) solid var(--line);
    background: var(--surface-2);
    color: var(--text);
    width: 100%;
  }
  .quirk select {
    padding: 6px;
    font-size: 0.8125rem;
    min-width: 0;
  }
  .x {
    background: none;
    border: 0;
    font-size: 20px;
    color: var(--text-2);
    cursor: pointer;
  }
  .note {
    font-size: 0.8125rem;
    color: var(--text-2);
    line-height: 1.45;
  }
  button:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>

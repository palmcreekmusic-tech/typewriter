<script lang="ts">
  // Advanced controls, tucked away. Milestone 1 has paper, type and layout;
  // ink, machine, mistakes and sound panels arrive with their milestones.
  import type { Settings, PaperKind } from '../engine/types';
  import { FONTS } from '../engine/fonts';
  import { INK } from '../engine/presets';
  import { FLAWS, resolveFlaws, setFlaw, type FlawKey } from '../engine/flaws';
  import { MACHINE_QUIRKS, QUIRK_KINDS, surpriseQuirks, type Quirk } from '../engine/quirks';
  import { randomSeed } from '../engine/rng';
  import { FIX_STYLES, type CorrectionSettings } from '../engine/corrections';

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
  ];
  const INKS: [string, string][] = [
    [INK.black, 'Black'],
    [INK.softBlack, 'Worn black'],
    [INK.carbonBlue, 'Carbon blue'],
    ['#7a2a22', 'Ribbon red'],
  ];

  const amounts = $derived(resolveFlaws(settings.flaws, settings.look.machine));
  const GROUPS = ['Ink', 'Typist', 'Machine', 'Paper'] as const;

  function flaw(key: FlawKey, v: number) {
    onChange({ ...settings, flaws: setFlaw(settings.flaws, key, v, settings.look.machine) });
  }
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

  function look<K extends keyof Settings['look']>(k: K, v: Settings['look'][K]) {
    onChange({ ...settings, look: { ...settings.look, [k]: v } });
  }
  function layout<K extends keyof Settings['layout']>(k: K, v: Settings['layout'][K]) {
    onChange({ ...settings, layout: { ...settings.layout, [k]: v } });
  }
</script>

<aside class="drawer" class:open aria-hidden={!open} inert={!open}>
  <header>
    <h2>Adjust</h2>
    <button type="button" class="close" onclick={onClose} aria-label="Close">×</button>
  </header>

  <section>
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
    <div class="field">
      <span>Ink</span>
      <div class="swatches">
        {#each INKS as [c, name]}
          <button
            type="button"
            class="swatch"
            style="--c:{c}"
            aria-pressed={settings.look.inkColor === c}
            aria-label={name}
            title={name}
            onclick={() => look('inkColor', c)}
          ></button>
        {/each}
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
  </section>

  <section>
    <h3>Mistakes and corrections</h3>
    <label class="field">
      <span>Fixed with</span>
      <select value={settings.corrections.style} onchange={(e) => fix('style', e.currentTarget.value as CorrectionSettings['style'])}>
        {#each FIX_STYLES as f}
          <option value={f.style}>{f.label}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      <span>Random typos <output>{Math.round(amounts.typos * 100)}</output></span>
      <input type="range" min="0" max="1" step="0.01" value={amounts.typos} oninput={(e) => flaw('typos', +e.currentTarget.value)} />
    </label>
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

  {#each GROUPS as group}
    <section>
      <h3>{group === 'Ink' ? 'Ink and ribbon' : group === 'Typist' ? 'The typist' : group === 'Machine' ? 'The machine' : 'Paper'}</h3>
      {#if group === 'Ink'}
        <label class="field">
          <span>Ribbon ink <output>{inkWord(settings.flaws.ink)}</output></span>
          <input type="range" min="0" max="1" step="0.01" value={settings.flaws.ink} oninput={(e) => inkLevel(+e.currentTarget.value)} />
        </label>
      {/if}
      {#each FLAWS.filter((f) => f.group === group && f.key !== 'typos') as f}
        <label class="field">
          <span>{f.label} <output>{Math.round(amounts[f.key] * 100)}</output></span>
          <input type="range" min="0" max="1" step="0.01" value={amounts[f.key]} oninput={(e) => flaw(f.key, +e.currentTarget.value)} />
        </label>
      {/each}
      {#if group === 'Machine'}
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
      {/if}
      {#if group === 'Paper'}
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
      {/if}
    </section>
  {/each}

  <section>
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

  <section>
    <button type="button" class="reset" onclick={onResetPreset}>Reset to preset</button>
    <p class="note">Every slider remembers how far you moved it from the master slider, so you can still slide from pro to first timer afterwards. Key quirks belong to the machine, so they stay put when you reroll. Sound gets its own panel in a later milestone.</p>
  </section>
</aside>

<style>
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(360px, 100vw);
    background: var(--panel);
    color: var(--ink);
    box-shadow: -20px 0 50px -20px rgba(0, 0, 0, 0.5);
    transform: translateX(105%);
    transition: transform 280ms cubic-bezier(0.3, 0.8, 0.2, 1);
    overflow-y: auto;
    z-index: 20;
    padding: 0 18px 32px;
  }
  .drawer.open {
    transform: none;
  }
  header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--panel);
    padding: 16px 0 10px;
  }
  h2 {
    font: 600 22px var(--display);
    margin: 0;
  }
  h3 {
    font: 600 12px var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 18px 0 10px;
  }
  .close {
    font-size: 28px;
    line-height: 1;
    background: none;
    border: 0;
    color: var(--ink);
    cursor: pointer;
    padding: 4px 8px;
  }
  .field {
    display: grid;
    gap: 6px;
    margin-bottom: 14px;
    font-size: 14px;
  }
  .field > span {
    display: flex;
    justify-content: space-between;
    color: var(--muted);
  }
  output {
    font: 12px var(--mono);
    color: var(--ink);
  }
  select {
    font: inherit;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--chip);
    color: var(--ink);
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
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
    font: 13px var(--ui);
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--chip);
    color: var(--ink);
    cursor: pointer;
    white-space: nowrap;
  }
  .seg button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--panel);
    border-color: var(--ink);
  }
  .swatches {
    display: flex;
    gap: 10px;
  }
  .swatch {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--c);
    border: 2px solid var(--panel);
    box-shadow: 0 0 0 1px var(--line);
    cursor: pointer;
  }
  .swatch[aria-pressed='true'] {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .reset {
    width: 100%;
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 14px;
    color: var(--muted);
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
    font-size: 14px;
    color: var(--muted);
  }
  .quirk {
    display: grid;
    grid-template-columns: 38px 1fr 70px 28px;
    gap: 6px;
    align-items: center;
  }
  .quirk .key {
    font: 18px var(--mono);
    text-align: center;
    padding: 5px 0;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--chip);
    color: var(--ink);
    width: 100%;
  }
  .quirk select {
    padding: 6px;
    font-size: 13px;
    min-width: 0;
  }
  .x {
    background: none;
    border: 0;
    font-size: 20px;
    color: var(--muted);
    cursor: pointer;
  }
  .note {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.45;
  }
  button:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>

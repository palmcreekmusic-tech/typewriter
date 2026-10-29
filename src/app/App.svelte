<script lang="ts">
  import { onMount } from 'svelte';
  import type { Mode, Settings } from '../engine/types';
  import { defaultSettings, applyPreset, SAMPLE_CAPTION, SAMPLE_LETTER, SAMPLE_PHOTO } from '../engine/document';
  import { layoutText, type Layout } from '../engine/layout';
  import type { Strikeout } from '../engine/timeline';
  import { captionCols, placeOnPrint, planPrint, printBase } from '../photo/plan';
  import { decode, itemKey, openRoll, sample, storedRoll, type Photo, type RollItem } from './photoStore';
  import { frameSeed } from '../photo/roll';
  import { captionFor, type CaptionStyle } from '../photo/caption';
  import { placeFor } from '../photo/places';
  import { hasInfo, type PhotoInfo } from '../photo/exif';
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
  import Icon from './Icon.svelte';
  import ExportPanel, { type StillFormat, type VideoChoice } from './ExportPanel.svelte';
  import { videoTiming } from '../export/timing';
  import { renderSheet, sheetPpi, toPdf, toPng, download, type StillInput } from '../export/still';
  import { currentTier, fileName } from '../export/plan';
  import { renderPrint } from '../photo/print';
  import { release } from '../render/canvas';
  import { isNight, setTheme, themePref, watchTheme } from './theme';
  import { perform, revealAt, type Performance, type Reveal } from '../engine/performance';
  import { strikesFor } from '../engine/strikes';
  import { keepMotorRunning, playNow, playPerformance } from '../audio/player';
  import { initSound, setSoundOn, sound } from './sound.svelte';

  const saved = loadSaved();
  let settings = $state<Settings>(saved?.settings ?? defaultSettings());
  let texts = $state<Record<Mode, string>>(saved?.texts ?? { caption: SAMPLE_CAPTION, letter: SAMPLE_LETTER, photo: SAMPLE_PHOTO });
  let caretIndex = $state(texts[settings.mode].length);
  let view = $state<'typewriter' | 'page'>('typewriter');
  let drawerOpen = $state(false);
  let exportOpen = $state(false);
  let saveButton = $state<HTMLButtonElement>();
  // spoken by VoiceOver: what just happened that isn't on the focused control
  let announce = $state('');
  const tier = currentTier();
  let presetsOpen = $state(false);
  let fontsReady = $state(false);
  let strikeTick = $state(0);
  // held down: show the same page typed perfectly
  let comparing = $state(false);
  let input: HTMLTextAreaElement;
  // Phones and tablets: the keyboard only comes up when you tap the paper,
  // never by itself after you touch a control.
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  let typing = $state(false);

  let edits = $state<Record<Mode, EditMemory>>(saved?.edits ?? { caption: emptyMemory(), letter: emptyMemory(), photo: emptyMemory() });
  const text = $derived(texts[settings.mode]);
  // Photo mode: the caption is laid out to fit the print, then placed on it.
  // A roll of photos shares one machine, ribbon and typist; each frame gets
  // its own seed, so its print and its typing are its own.
  let photo = $state<Photo>(sample());
  let roll = $state<RollItem[]>([]);
  let frame = $state(Math.max(0, saved?.frame ?? 0));
  let captions = $state<Record<string, string>>(saved?.captions ?? {});
  const doc = $derived(settings.mode === 'photo' && roll.length > 1 && frame > 0 ? { ...settings, seed: frameSeed(settings.seed, frame) } : settings);
  const base = $derived(settings.mode === 'photo' ? printBase(photo.aspect, settings.photo, doc.seed) : null);
  const laySettings = $derived(
    base ? { ...settings.layout, captionWidth: Math.min(settings.layout.captionWidth, captionCols(base, settings.photo, 1 / settings.layout.pitch)) } : settings.layout,
  );
  function lay(outs?: Strikeout[]): Layout {
    const l = layoutText(text, settings.mode, laySettings, outs);
    return base ? placeOnPrint(l, planPrint(base, settings.photo, doc.seed, l)) : l;
  }
  const layout = $derived(lay());
  const preset = $derived(presetById(settings.presetId));
  const isCustom = $derived(
    !preset ||
      JSON.stringify(preset.look) !== JSON.stringify(settings.look) ||
      preset.pitch !== settings.layout.pitch ||
      Math.abs(preset.typist - settings.flaws.typist) > 0.005 ||
      Math.abs(preset.machine - settings.flaws.machine) > 0.005 ||
      Math.abs(preset.ink - settings.flaws.ink) > 0.005 ||
      isTweaked(settings.flaws) ||
      JSON.stringify(settings.quirks) !== JSON.stringify(MACHINE_QUIRKS[preset.look.machine]),
  );
  const amounts = $derived(resolveFlaws(settings.flaws, settings.look.machine));
  // Every correction on the page: random typos plus your own backspaces.
  const allTheFixes = $derived(
    allFixes(autoFixes(layout, doc.seed, effectiveFlaws(settings.flaws, settings.look.machine, settings.artistic).typos), settings.corrections.keepBackspaces ? edits[settings.mode].fixes : [], text),
  );
  // X-outs and strikethroughs leave the wrong word on the page, so they
  // change the layout; the other styles fix letters in place.
  const mark = $derived(MARKS[settings.corrections.style]);
  const outs = $derived(mark ? strikeoutsFor(text, allTheFixes, doc.seed, mark) : []);
  const typedLayout = $derived(outs.length ? lay(outs) : layout);
  const fixes = $derived(mark ? new Map<number, Fix>() : allTheFixes);

  const shown = $derived(comparing ? perfectOf(doc) : doc);
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
  // The two big sliders: who is typing, and what shape the machine is in.
  const word = (t: number, words: string[]) => words[t < 0.12 ? 0 : t < 0.35 ? 1 : t < 0.6 ? 2 : t < 0.85 ? 3 : 4];
  const LEVELS = [
    { key: 'typist', label: 'Typist', aria: 'Typist, pro to first timer', words: ['Pro typist', 'Practiced', 'Hobbyist', 'Rusty', 'First timer'] },
    { key: 'machine', label: 'Machine', aria: 'Machine, just serviced to attic find', words: ['Just serviced', 'Well kept', 'Well used', 'Tired', 'Attic find'] },
  ] as const;

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
  // Sound: on unless you turn it off, remembered in this browser.
  const soundOn = $derived(sound.on);
  const toggleSound = () => setSoundOn(!sound.on);

  /** The sound of what you just typed, as hard as the strike printed. */
  function soundForEdit(before: string, after: string, caret: number) {
    if (!soundOn || comparing) return;
    const machine = settings.look.machine;
    keepMotorRunning(machine);
    if (after.length < before.length) return playNow({ sound: 'backspace', pressure: 0.5 }, machine, doc.seed);
    if (after.length !== before.length + 1) return;
    const ch = after[caret - 1];
    if (ch === '\n') return playNow({ sound: 'return', pressure: 0.6, dur: 0.3 }, machine, doc.seed);
    if (ch === ' ') return playNow({ sound: 'space', pressure: 0.5 }, machine, doc.seed);
    if (ch === '\t') return playNow({ sound: 'tab', pressure: 0.5 }, machine, doc.seed);
    // the pressure comes from the strike itself, so a dark letter sounds hard
    const cell = typedLayout.cells.findIndex((c) => c.index === caret - 1);
    const st = cell >= 0 ? strikesFor(typedLayout, doc).find((x) => x.cell === cell) : undefined;
    const electric = machine === 'selectric' || machine === 'electronic';
    const pressure = electric ? 0.6 : st ? Math.max(0, Math.min(1, (st.strength - 0.35) / 1.25)) : 0.5;
    if (ch !== ch.toLowerCase() && !electric) playNow({ sound: 'shift', pressure: 0.4 }, machine, doc.seed);
    playNow({ sound: 'key', ch, pressure }, machine, doc.seed);
    if (cell >= 0 && typedLayout.cells[cell].col === typedLayout.bellCol) playNow({ sound: 'bell', pressure: 0.6 }, machine, doc.seed);
  }

  // Save: drawn again at print size by the same renderer as the screen.
  function stillInput(): StillInput {
    const plan = typedLayout.print;
    return {
      layout: typedLayout,
      settings: $state.snapshot(doc) as Settings,
      fixes,
      print: plan ? (ppi) => ({ canvas: renderPrint(photo.source, photo.id, plan, ppi, doc.seed), strip: plan.strip }) : undefined,
    };
  }
  const pageNow = $derived(typedLayout.caret[Math.min(caretIndex, typedLayout.caret.length - 1)]?.page ?? 0);
  function sizeFor(format: StillFormat) {
    const pg = typedLayout.pages[pageNow] ?? typedLayout.pages[0];
    const ppi = sheetPpi(typedLayout, pageNow, tier);
    const px = `${Math.round(pg.width * ppi)} × ${Math.round(pg.height * ppi)} px`;
    return format === 'pdf' ? `${pg.width} × ${pg.height} in, ${Math.round(ppi)} ppi` : px;
  }
  async function saveStill(format: StillFormat, paper: boolean) {
    await document.fonts.ready;
    const input = stillInput();
    const ext = paper ? '' : '-ink';
    if (format === 'pdf') {
      download(await toPdf(input, { paper, tier }), fileName(text, 'pdf').replace(/\.pdf$/, `${ext}.pdf`));
      announce = 'PDF saved';
      return;
    }
    const c = renderSheet(input, pageNow, { paper, tier });
    const blob = await toPng(c);
    release(c);
    download(blob, fileName(text, 'png').replace(/\.png$/, `${ext}.png`));
    announce = 'Picture saved';
  }

  const performanceNow = () => perform({ layout: typedLayout, strikes: strikesFor(typedLayout, doc), fixes, settings: doc });
  function videoNote() {
    const t = videoTiming(performanceNow().duration, tier);
    const secs = `${Math.round(t.duration)} s`;
    if (t.speed === 1) return secs;
    return `${secs}, typed ${t.speed.toFixed(1)}× faster${t.cut ? ' and cut' : ''} to fit`;
  }
  async function saveVideo(v: VideoChoice, onProgress: (p: number) => void, signal: AbortSignal) {
    await document.fonts.ready;
    const input = stillInput();
    const desk = getComputedStyle(document.documentElement).getPropertyValue('--desk').trim() || '#c9c9c6';
    // the encoder loads only when a video is made
    const { renderVideo } = await import('../export/video');
    const { blob, ext } = await renderVideo({ ...input, fixes, perf: performanceNow() }, { ...v, desk, tier, onProgress, signal });
    download(blob, fileName(text, `${v.paper ? '' : 'ink.'}${v.aspect.replace(':', 'x')}.${ext}`));
    announce = 'Video saved';
  }

  // Play: the whole page typed again from the top, with its sound.
  let reveal = $state<Reveal | undefined>(undefined);
  let stopPlay: (() => void) | null = null;
  function play() {
    if (stopPlay) return stopPlay();
    const perf: Performance = performanceNow();
    const audio = soundOn ? playPerformance(perf, settings.look.machine, doc.seed) : null;
    const t0 = performance.now();
    const clock = audio ? audio.now : () => (performance.now() - t0) / 1000;
    view = 'typewriter';
    let frame = 0;
    let lastCell = -1;
    const tick = () => {
      const t = clock();
      if (t > perf.duration) return stopPlay?.();
      const r = revealAt(perf, Math.max(0, t), typedLayout, fixes);
      if (r.upTo !== lastCell) {
        lastCell = r.upTo;
        strikeTick++;
      }
      reveal = r;
      frame = requestAnimationFrame(tick);
    };
    stopPlay = () => {
      cancelAnimationFrame(frame);
      audio?.stop();
      reveal = undefined;
      stopPlay = null;
      playing = false;
      announce = 'Finished playing';
    };
    playing = true;
    announce = 'Playing the page from the top';
    tick();
  }
  let playing = $state(false);

  // Day or night desk: follows the system until you pick one.
  let night = $state(isNight());
  function toggleNight() {
    setTheme(night ? 'day' : 'night');
    night = isNight(themePref());
  }

  onMount(() => {
    const unwatch = watchTheme(() => (night = isNight()));
    void initSound();
    void storedRoll().then((items) => {
      if (!items.length) return;
      roll = items;
      const i = Math.min(frame, items.length - 1);
      frame = i;
      return decode(items[i]).then((p) => (photo = p));
    });
    setTimeout(() => FONTS.forEach((f) => loadFont(f).catch(() => {})), 2500);
    focusInput();
    // iOS doesn't shrink the page for the keyboard; it slides the whole page
    // up instead. Fit the app to what's actually visible and keep it put.
    const vv = window.visualViewport;
    if (!vv) return unwatch;
    const fit = () => {
      document.documentElement.style.setProperty('--app-h', `${vv.height}px`);
      if (vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
    return () => {
      unwatch();
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
    };
  });

  $effect(() => {
    const it = roll[frame];
    // this frame's caption is kept with the others as you type
    const all = it ? { ...captions, [itemKey(it)]: texts.photo } : captions;
    save({ settings: $state.snapshot(settings), texts: $state.snapshot(texts), edits: $state.snapshot(edits), captions: all, frame });
  });

  /** Puts the cursor back in the hidden text box. On touch screens only a tap on the paper does that. */
  function focusInput(fromPaper = false) {
    if (touch && !fromPaper) return;
    input?.focus({ preventScroll: true });
  }
  function syncCaret() {
    if (input) caretIndex = input.selectionEnd ?? input.value.length;
  }
  function setCaret(i: number, focus = true) {
    caretIndex = i;
    if (input) {
      if (focus) input.focus({ preventScroll: true });
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
    const before = texts[settings.mode];
    edits[settings.mode] = trackEdit(edits[settings.mode], before, input.value);
    texts[settings.mode] = input.value;
    syncCaret();
    soundForEdit(before, input.value, caretIndex);
  }

  function setMode(m: Mode) {
    if (m === settings.mode) return;
    settings.mode = m;
    caretIndex = texts[m].length;
    queueMicrotask(() => setCaret(texts[m].length, !touch || typing));
  }
  let photoInput = $state<HTMLInputElement>();
  /** Opens the photos you picked as a roll, each with a first caption if its details allow. */
  async function pickPhotos(files: File[]) {
    const items = await openRoll(files);
    if (!items.length) return;
    keepCaption();
    const t = texts.photo.trim();
    const first = !t || t === SAMPLE_PHOTO || t === lastAuto ? '' : texts.photo;
    const next: Record<string, string> = {};
    await Promise.all(
      items.map(async (it, i) => {
        // a photo you've captioned before keeps its words
        next[itemKey(it)] = captions[itemKey(it)] ?? (i === 0 && first ? first : await autoCaption(it, 'note'));
      }),
    );
    roll = items;
    captions = next;
    if (settings.mode !== 'photo') setMode('photo');
    await showFrame(0, false);
  }
  /** Keeps what you typed under this frame's photo. */
  function keepCaption() {
    const it = roll[frame];
    if (it) captions = { ...captions, [itemKey(it)]: texts.photo };
  }
  async function showFrame(i: number, keep = true) {
    if (!roll.length) return;
    if (keep) keepCaption();
    i = Math.max(0, Math.min(roll.length - 1, i));
    try {
      const p = await decode(roll[i]);
      if (photo.source instanceof ImageBitmap) photo.source.close();
      photo = p;
    } catch {
      /* not an image this browser can read: leave the last one up */
    }
    frame = i;
    texts.photo = captions[itemKey(roll[i])] ?? '';
    lastAuto = texts.photo;
    edits.photo = emptyMemory();
    if (settings.mode === 'photo') setCaret(texts.photo.length, !touch);
  }
  async function autoCaption(it: { info?: PhotoInfo }, style: CaptionStyle) {
    const info = it.info;
    if (!hasInfo(info)) return '';
    const place = info!.lat !== undefined && info!.lon !== undefined ? await placeFor(info!.lat, info!.lon) : null;
    return captionFor(info!, place, style);
  }
  /** Writes a caption from the photo's date, camera and place. */
  let lastAuto = '';
  async function captionFrom(style: CaptionStyle) {
    const t = await autoCaption(photo, style);
    if (!t) return;
    texts.photo = lastAuto = t;
    edits.photo = emptyMemory();
    if (settings.mode === 'photo') setCaret(t.length, !touch);
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

<div
  class="app"
  role="presentation"
  ondragover={(e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  }}
  ondrop={(e) => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    void pickPhotos([...e.dataTransfer.files]);
  }}
>
  <header class="top">
    <div class="brand" role="heading" aria-level="1" aria-label="type[writer]">
      <span aria-hidden="true">type<span class="br">[</span>writer<span class="br">]</span></span>
    </div>
    <div class="seg" role="group" aria-label="Mode">
      <button type="button" aria-pressed={settings.mode === 'caption'} onclick={() => setMode('caption')}>Caption</button>
      <button type="button" aria-pressed={settings.mode === 'letter'} onclick={() => setMode('letter')}>Letter</button>
      <button type="button" aria-pressed={settings.mode === 'photo'} onclick={() => setMode('photo')}>Photo</button>
    </div>
    {#if settings.mode === 'photo'}
      <button type="button" class="btn pick" onclick={() => photoInput?.click()} title="Pick a photo, or several to caption as one roll"
        ><Icon name="image" /><span class="long">{photo.sample ? 'Choose photos' : 'Change photos'}</span></button
      >
      <input
        bind:this={photoInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onchange={(e) => {
          void pickPhotos([...(e.currentTarget.files ?? [])]);
          e.currentTarget.value = '';
        }}
      />
      {#if roll.length > 1}
        <div class="roll" role="group" aria-label="Roll">
          <button type="button" onclick={() => void showFrame(frame - 1)} disabled={frame === 0} aria-label="Previous photo">‹</button>
          <span aria-live="polite">{frame + 1} of {roll.length}</span>
          <button type="button" onclick={() => void showFrame(frame + 1)} disabled={frame >= roll.length - 1} aria-label="Next photo">›</button>
        </div>
      {/if}
    {/if}
    <div class="spacer"></div>
    <button
      type="button"
      class="btn icon-only"
      aria-pressed={!soundOn}
      onclick={toggleSound}
      aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
      title={soundOn ? 'Sound on' : 'Sound off'}><Icon name={soundOn ? 'sound' : 'mute'} /></button
    >
    <button
      type="button"
      class="btn icon-only"
      onclick={toggleNight}
      aria-label={night ? 'Day desk' : 'Night desk'}
      title={night ? 'Day desk' : 'Night desk'}><Icon name={night ? 'sun' : 'moon'} /></button
    >
    <button type="button" class="btn" aria-pressed={playing} onclick={play} title="Type the whole page again, with sound"
      ><Icon name={playing ? 'stop' : 'play'} /><span class="long">{playing ? 'Stop' : 'Play'}</span></button
    >
    <button
      type="button"
      class="btn"
      aria-pressed={view === 'page'}
      onclick={() => {
        view = view === 'page' ? 'typewriter' : 'page';
        focusInput();
      }}
      ><Icon name={view === 'page' ? 'type' : 'page'} /><span class="long">{view === 'page' ? 'Back to typing' : 'See the page'}</span></button
    >
    <button bind:this={saveButton} type="button" class="btn" aria-expanded={exportOpen} aria-haspopup="dialog" onclick={() => (exportOpen = !exportOpen)} title="Save a picture, a PDF or a video"
      ><Icon name="save" /><span class="long">Save</span></button
    >
    <button type="button" class="btn" aria-expanded={drawerOpen} onclick={() => (drawerOpen = !drawerOpen)}><Icon name="sliders" /><span class="long">Adjust</span></button>
  </header>

  <div class="sr-only" aria-live="polite">{announce}</div>
  <ExportPanel open={exportOpen} {tier} {sizeFor} {videoNote} pages={typedLayout.pages.length} onSave={saveStill} onSaveVideo={saveVideo} onClose={() => {
      exportOpen = false;
      saveButton?.focus();
    }} />

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
    onFocusRequest={() => focusInput(true)}
    hint={touch && !typing && view === 'typewriter' && !playing ? 'Tap the paper to type' : ''}
    {reveal}
    {photo}
  />

  <footer class="toolbar">
    <div class="presets">
      <button type="button" class="preset-btn" aria-expanded={presetsOpen} onclick={() => (presetsOpen = !presetsOpen)}>
        <span class="dot" style="--c:{MACHINES[settings.look.machine].body}"></span>
        <span class="pname">{!preset || preset.look.machine !== settings.look.machine ? 'Your own look' : preset.name + (isCustom ? ' · custom' : '')}</span>
        <Icon name="chevron" />
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

    <div class="levels">
      {#each LEVELS as l}
        <label class="level">
          <span class="label">{l.label}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.flaws[l.key]}
            oninput={(e) => (settings.flaws = { ...settings.flaws, [l.key]: +e.currentTarget.value })}
            onchange={() => focusInput()}
            aria-label={l.aria}
            aria-valuetext={word(settings.flaws[l.key], [...l.words])}
          />
          <output>{word(settings.flaws[l.key], [...l.words])}</output>
        </label>
      {/each}
    </div>

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
            onchange={() => focusInput()}
            aria-label={d.label}
          />
        </label>
      {/each}
    </div>

    <div class="tools">
      <button type="button" class="btn icon-only" onclick={surprise} aria-label="Surprise me" title="Surprise me: a whole new machine, typeface, paper, ink and flaws"><Icon name="dice" /></button>
      <button
        type="button"
        class="btn icon-only hold"
        aria-pressed={comparing}
        aria-label="Hold for perfect"
        title="Hold to see the same page typed perfectly"
        onpointerdown={(e) => {
          e.preventDefault();
          comparing = true;
        }}
        onpointerup={() => (comparing = false)}
        onpointerleave={() => (comparing = false)}
        onpointercancel={() => (comparing = false)}
        onkeydown={(e) => (e.key === ' ' || e.key === 'Enter') && (comparing = true)}
        onkeyup={() => (comparing = false)}
        oncontextmenu={(e) => e.preventDefault()}><Icon name="perfect" /></button
      >
      <span class="divider" aria-hidden="true"></span>
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
      </div>
      <button
        type="button"
        class="btn icon-only"
        aria-pressed={settings.seedLocked}
        aria-label={settings.seedLocked ? 'Unlock seed' : 'Lock seed'}
        title={settings.seedLocked ? 'Unlock seed' : 'Lock seed'}
        onclick={() => (settings.seedLocked = !settings.seedLocked)}><Icon name={settings.seedLocked ? 'lock' : 'unlock'} /></button
      >
      <button type="button" class="btn icon-only" disabled={settings.seedLocked} onclick={reroll} aria-label="Reroll" title="Reroll: same look, new seed"><Icon name="reroll" /></button>
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
    onfocus={() => (typing = true)}
    onblur={() => (typing = false)}
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
    photoInfo={photo.info}
    onCaptionFrom={(s) => void captionFrom(s)}
  />
</div>

<style>
  .app {
    height: var(--app-h, 100dvh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }
  .app > :global(.stage) {
    position: absolute;
    inset: 0;
  }

  /* The header: name, mode and view. Everything that changes the look lives
     in the one toolbar below, and the rest in the drawer. */
  .top {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: max(12px, env(safe-area-inset-top)) 16px 12px;
    pointer-events: none;
  }
  .top > * {
    pointer-events: auto;
  }
  .brand {
    font: 600 1.0625rem/1 var(--ui);
    letter-spacing: -0.01em;
    margin-right: 8px;
  }
  .brand .br {
    color: var(--text-2);
    font-weight: 400;
  }
  .spacer {
    flex: 1;
    pointer-events: none;
  }
  .seg {
    display: flex;
    background: var(--surface);
    border: var(--hair) solid var(--line);
    border-radius: 999px;
    padding: 2px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .seg button {
    font: 500 0.8125rem var(--ui);
    color: var(--text-2);
    background: none;
    border: 0;
    border-radius: 999px;
    padding: 6px 14px;
    cursor: pointer;
  }
  .roll {
    display: flex;
    align-items: center;
    gap: 2px;
    font: 500 0.8125rem var(--num);
    color: var(--text-2);
    background: var(--surface);
    border: var(--hair) solid var(--line);
    border-radius: 999px;
    padding: 2px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .roll span {
    padding: 0 4px;
    white-space: nowrap;
  }
  .roll button {
    font: 400 1rem/1 var(--ui);
    color: var(--text);
    background: none;
    border: 0;
    border-radius: 999px;
    width: 28px;
    height: 28px;
    cursor: pointer;
  }
  .roll button:disabled {
    color: var(--text-2);
    opacity: 0.4;
    cursor: default;
  }
  .seg button[aria-pressed='true'] {
    background: var(--sel);
    color: var(--on-sel);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 500 0.8125rem var(--ui);
    color: var(--text);
    background: var(--surface);
    border: var(--hair) solid var(--line);
    border-radius: 999px;
    padding: 7px 12px;
    cursor: pointer;
    white-space: nowrap;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .btn.icon-only {
    padding: 7px;
  }
  .btn[aria-pressed='true'],
  .btn[aria-expanded='true'] {
    background: var(--sel);
    color: var(--on-sel);
    border-color: var(--sel);
  }
  .btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .hold {
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
  }

  /* The toolbar: one quiet surface, hairline dividers between groups. */
  .toolbar {
    position: absolute;
    left: 50%;
    bottom: max(14px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(1180px, calc(100% - 32px));
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0;
    background: var(--surface);
    border: var(--hair) solid var(--line);
    border-radius: 14px;
    box-shadow: 0 6px 18px -10px rgba(var(--shadow), 0.35);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .toolbar > * {
    padding: 8px 14px;
  }
  .toolbar > * + * {
    border-left: var(--hair) solid var(--line);
  }
  .label {
    font: 500 0.6875rem var(--ui);
    color: var(--text-2);
    white-space: nowrap;
  }
  .presets {
    position: relative;
    align-self: stretch;
    display: flex;
    align-items: center;
    padding: 4px 6px;
  }
  .preset-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 500 0.8125rem var(--ui);
    color: var(--text);
    background: none;
    border: 0;
    border-radius: 8px;
    padding: 8px 8px;
    cursor: pointer;
    max-width: 230px;
  }
  .preset-btn:hover {
    background: var(--surface-2);
  }
  .pname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
    flex: none;
  }
  .preset-list {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 0;
    list-style: none;
    margin: 0;
    padding: 6px;
    width: min(320px, calc(100vw - 32px));
    max-height: 60vh;
    overflow: auto;
    background: var(--surface-solid);
    border: var(--hair) solid var(--line);
    border-radius: 12px;
    box-shadow: 0 12px 30px -14px rgba(var(--shadow), 0.5);
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
    padding: 8px 10px;
    cursor: pointer;
    color: var(--text);
  }
  .preset-list button:hover,
  .preset-list button[aria-selected='true'] {
    background: var(--surface-2);
  }
  .ptext {
    display: grid;
  }
  .ptext b {
    font: 600 0.875rem var(--ui);
  }
  .ptext small {
    font-size: 0.75rem;
    color: var(--text-2);
  }
  .levels {
    flex: 1.3 1 0;
    min-width: 0;
    display: grid;
    gap: 0;
  }
  .level {
    display: grid;
    grid-template-columns: 4.2em minmax(60px, 1fr) 6.5em;
    align-items: center;
    column-gap: 10px;
  }
  .level input,
  .dial input {
    width: 100%;
  }
  .level output {
    font: 0.75rem var(--ui);
    color: var(--text);
    white-space: nowrap;
  }
  .dials {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    gap: 14px;
  }
  .dial {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .dial .label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tools .btn {
    background: none;
    border-color: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .tools .btn:not(:disabled):hover {
    background: var(--surface-2);
  }
  .tools .btn[aria-pressed='true'] {
    background: var(--sel);
  }
  .divider {
    width: var(--hair);
    align-self: stretch;
    background: var(--line);
    margin: 0 4px;
  }
  .seed {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .seed input {
    width: 3.6em;
    font: 0.8125rem var(--num);
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: var(--hair) solid transparent;
    text-align: center;
    padding: 2px 0;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .seed input::-webkit-inner-spin-button {
    display: none;
  }
  .seed input:focus {
    border-bottom-color: var(--accent);
    outline: none;
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

  /* Narrower screens: the toolbar becomes a sheet along the bottom edge,
     the two big sliders first, where a thumb reaches them. */
  @media (max-width: 900px) {
    .toolbar {
      flex-wrap: wrap;
      left: 0;
      right: 0;
      bottom: 0;
      transform: none;
      width: auto;
      border-radius: 16px 16px 0 0;
      border-width: var(--hair) 0 0;
      padding: 6px 4px max(8px, env(safe-area-inset-bottom));
    }
    .toolbar > * {
      padding: 6px 12px;
    }
    .toolbar > * + * {
      border-left: 0;
    }
    .levels {
      order: -2;
      flex: 1 1 100%;
    }
    .dials {
      order: -1;
      flex: 1 1 100%;
      border-bottom: var(--hair) solid var(--line);
      padding-bottom: 10px;
    }
    .presets {
      flex: 1 1 0;
      min-width: 0;
      padding-left: 6px;
    }
    .preset-btn {
      max-width: 100%;
      min-width: 0;
    }
  }
  @media (max-width: 560px) {
    /* the mode switch gets its own row, so nothing in the header gets squeezed out */
    .top {
      padding-left: 12px;
      padding-right: 12px;
      gap: 6px;
      flex-wrap: wrap;
      row-gap: 8px;
    }
    .top .seg {
      order: 10;
      margin: 0 auto;
    }
    .top .seg:has(+ .pick) {
      margin-right: 0;
    }
    .top .pick {
      order: 11;
    }
    .top .roll {
      order: 12;
    }
    .top .pick,
    .top .roll {
      margin-right: auto;
    }
    .top .pick:has(~ .roll) {
      margin-right: 0;
    }
    .brand {
      font-size: 1rem;
      margin-right: 2px;
    }
    .long {
      display: none;
    }
    .btn:not(.icon-only) {
      padding: 7px;
    }
    .seg button {
      padding: 6px 11px;
    }
    .seed .label,
    .divider {
      display: none;
    }
    .tools {
      gap: 2px;
      padding-left: 4px;
      padding-right: 6px;
    }
    .level {
      grid-template-columns: 4em minmax(60px, 1fr) 6.2em;
    }
  }

</style>

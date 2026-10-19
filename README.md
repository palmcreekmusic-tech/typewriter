# Typewriter

A lifelike, artistic typewriter for captions and text overlays on photos and video. You type perfect text; a seeded flaw layer makes it look human, and you decide how imperfect it gets.

**Web app:** https://palmcreekmusic-tech.github.io/typewriter/

## Status

Built in milestones (see the design proposal in the project files):

1. **Paper and typing** ✓ illustrated machines for 8 era presets, caption and letter modes, margins, tabs, line spacing, page breaks, seeded glyph variation
2. Flaw layer
3. Mistakes and corrections
4. Sound and Play
5. Export (PNG, PDF, transparent, up to 4K)
6. Photo mode with Film Lab borders
7. Animation export, Mac app

## Develop

```sh
npm install
npm run dev      # local server
npm test         # unit tests
npm run check    # type check
npm run build    # static site in dist/
```

The engine (`src/engine`, `src/render`) has no UI framework code, so the same rendering serves the screen, exports and the Mac app.

## Fonts and licenses

All bundled typefaces are free to ship. License texts are next to each font in `public/fonts/`.

| Font | License |
|---|---|
| TT2020 by Fredrick R. Brennan | SIL OFL 1.1 |
| Courier Prime | SIL OFL 1.1 |
| Cutive Mono | SIL OFL 1.1 |
| IBM Plex Mono | SIL OFL 1.1 |
| Special Elite (Astigmatic) | Apache 2.0 |

TT2020 draws each character 9 ways using contextual alternates. Because the app draws every character separately, `scripts/split_tt2020.py` bakes each alternate set into its own small font file (`public/fonts/tt2020/`).

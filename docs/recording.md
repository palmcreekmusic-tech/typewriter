# Sounds: recorded packs and your own recordings

type[writer] synthesises every sound by default. A recorded pack ("Real machine") replaces the synthesised voice for machines of the same kind: a manual or electric typebar machine, a Selectric typeball, or a daisywheel. Anything a pack lacks (whiteout brush, tab) still comes from the synth.

## Free recordings to start from

All CC0 (public domain: free to use commercially, no credit required, though we credit anyway). Downloading from Freesound needs a free account.

| Recording | What's on it | Use for |
|---|---|---|
| [Typewriter Sounds](https://freesound.org/people/Gate13/sounds/697389/) by Gate13 | About 6 minutes: typing, carriage return, platen knob, paper loading, bell, with the author naming each action first | Most of a full pack: cut it into keys, return, feed and bell files |
| [Typewriter, single key, type 1](https://freesound.org/people/yottasounds/sounds/380138/) by yottasounds | One keystroke, 96 kHz, part of a "typewriter" pack of single hits | Key strikes; grab the rest of that pack too |
| [Typewriter ding](https://freesound.org/people/_stubb/sounds/406243/) by _stubb | The margin bell, close and mono | Bell |
| [Typewriter bell & carriage reset](https://freesound.org/people/knufds/sounds/345955/) by knufds | Bell then carriage return on an antique machine | Return |

Checked on 29 Oct 2026. Never use ripped audio from films, games or paid libraries.

## Recording your own machine

A phone held about 30 cm above the keys in a quiet room works. Record in WAV if you can.

1. **Keys:** type the same few letters (a, s, e, o, t, n, period, comma) at three strengths: light, normal, hard. Leave about half a second between strikes. 40 to 60 strikes is plenty. Several files are fine.
2. **Space bar:** 10 presses.
3. **Return:** 3 to 5 carriage returns from different points on the line, one per file.
4. **Bell:** type up to the bell a few times.
5. **Backspace** and **Shift:** 10 each.
6. **Paper feed:** wind a sheet in with the knob, one per file.

Name each file after what's on it: `keys-light.wav`, `keys-hard.wav`, `space.wav`, `return-1.wav`, `bell.wav`, `backspace.wav`, `shift.wav`, `feed.wav`. Add a `credits.txt` with where it came from.

## Making the pack

```sh
node scripts/sounds/import.mjs ~/recordings/hermes hermes "Hermes 3000" typebar
```

The script finds each strike, trims it, sorts the keys into soft, normal and hard by how loud they were, and writes `public/sounds/hermes/` plus an entry in `public/sounds/index.json`. The pack then shows up under Adjust → Sound → Voice. In the app each strike picks the layer by the typist's pressure and a different take from last time.

To try the pipeline without a machine, `scripts/sounds/fake-recordings.mjs` makes pretend takes from the synthesiser.

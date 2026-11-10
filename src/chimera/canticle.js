/**
 * THE CANTICLE — the vocal arrangement of the five rails.
 *
 * Every note here is sung by the CHIMERA physical-model voice. The melodies are
 * written as scale degrees over each stage's own mode and chord progression, so
 * the singer follows the same harmony as the generative score; the beatbox patterns
 * are 16-step gesture sequences (one sound per step) that the engine performs with
 * its mouth. Lyrics are original; `scripts/build-canticle-lyrics.mjs` turns each
 * line into the engine's syllable records with the CMU pronouncing dictionary.
 */

/** The bodies the singer can wear. `octave` shifts the written melody into range. */
export const CANTICLE_BODIES = {
  female: { id: 'female', name: 'Soprano', blurb: 'Clear and high, the voice of the light.', mix: { female: 1, child: 0 }, octave: 0 },
  male: { id: 'male', name: 'Tenor', blurb: 'Low and warm, the voice of the old kingdom.', mix: { female: 0, child: 0 }, octave: -12 },
  child: { id: 'child', name: 'Child', blurb: 'Small and bright, the voice the Triforce answers.', mix: { female: 1, child: 1 }, octave: 0 },
};

export const CANTICLE_BODY_ORDER = ['female', 'male', 'child'];

/**
 * A line is a two-bar phrase. `degrees` are scale degrees of the stage's mode
 * (0 = the root, 7 = the octave), `beats` are note lengths in beats, and their sum
 * is 8. `text` is rendered by the dictionary into one syllable per note.
 */
const line = (text, degrees, beats) => ({ text, degrees, beats });

export const CANTICLE = {
  field: {
    title: 'HYRULE FIELD',
    motto: 'A warm voice over the golden plain',
    // D dorian: Dm · Bb · F · C. A line is two bars, with a note on every beat (or
    // a quick pickup) and the last held, so its turn lands with the chord change.
    rail: [
      line('The field remembers the light', [0, 2, 4, 6, 4, 2, 0], [1, 1, 1, 1, 1, 1, 2]),
      line('And the grass remembers your name', [1, 2, 4, 6, 3, 5, 6, 1], [0.5, 0.5, 1, 1, 1, 1, 1, 2]),
    ],
    boss: [
      line('The eye opens in the grass', [0, 2, 4, 2, 3, 1, 0], [0.5, 0.5, 1, 1, 1, 1, 3]),
      line('The curse stares back from the dark', [4, 6, 4, 2, 3, 6, 6], [0.5, 0.5, 1, 1, 1, 1, 3]),
    ],
    beat: ['B', null, 't', null, 'Pf', null, 't', null, 'm', null, null, null, 'Pf', null, 't', null],
  },
  woods: {
    title: 'THE LOST WOODS',
    motto: 'A hush between the lanterns',
    // A aeolian: Am · Em · F · G
    rail: [
      line('Lanterns in the hollow dark', [0, 2, 4, 3, 6, 3, 1], [1, 1, 1, 1, 1, 1, 2]),
      line('Do not look into the dark', [0, 2, 4, 5, 3, 1, 6], [1, 1, 1, 1, 1, 1, 2]),
    ],
    boss: [
      line('The oldest roots are waking', [0, 2, 4, 2, 2, 5, 0], [0.5, 0.5, 1, 1, 1, 1, 3]),
      line('The bloom remembers the light', [0, 2, 3, 2, 3, 1, 4], [0.5, 0.5, 1, 1, 1, 1, 3]),
    ],
    beat: ['B', null, null, null, 'Pf', null, '!', null, 'm', null, null, null, null, 't', null, null],
  },
  mountain: {
    title: 'DEATH MOUNTAIN',
    motto: 'Ash in the throat, iron in the chest',
    // C phrygian: Cm · Ab · Bb · G
    rail: [
      line('The mountain breathes in fire', [0, 0, 2, 4, 2, 0, 0], [1, 1, 1, 1, 1, 1, 2]),
      line('Ash and ember the mountain sings', [3, 6, 3, 6, 4, 0, 4, 4], [0.5, 0.5, 1, 1, 0.5, 0.5, 1, 3]),
    ],
    boss: [
      line('The furnace king has risen', [0, 2, 4, 6, 3, 1, 0], [1, 1, 0.5, 0.5, 1, 1, 3]),
      line("The mountain's heart is burning", [5, 4, 2, 4, 6, 3, 6], [0.5, 0.5, 1, 1, 1, 1, 3]),
    ],
    beat: ['B', null, 'B', null, 'Pf', null, 'm', null, 'B', null, 'B', null, 'Pf', 't', null, 't'],
  },
  castle: {
    title: 'HYRULE CASTLE',
    motto: 'A crown of grief, sung low',
    // G harmonic minor: Gm · Eb · F · D
    rail: [
      line('A crown of grief upon the throne', [0, 2, 4, 3, 2, 5, 0, 0], [1, 1, 0.5, 0.5, 1, 1, 0.5, 2.5]),
      line('The throne remembers a queen', [1, 3, 1, 8, 6, 4, 1], [0.5, 0.5, 1, 1, 0.5, 0.5, 4]),
    ],
    boss: [
      line('The last malice is a crown', [0, 2, 4, 5, 2, 0, 0], [1, 1, 0.5, 0.5, 1, 1, 3]),
      line('And the dark remembers a king', [6, 4, 6, 4, 3, 5, 0, 0], [0.5, 0.5, 1, 1, 1, 1, 1, 2]),
    ],
    beat: ['B', null, null, 'Pf', null, null, 'm', null, 'B', null, null, 'Pf', null, 't', null, 't'],
  },
  sacred: {
    title: 'THE SACRED REALM',
    motto: 'Three lights, one breath',
    // D lydian: D · A · G · Em
    rail: [
      line('The three lights answer the dawn', [4, 6, 7, 6, 4, 2, 4], [1, 1, 1, 1, 1, 1, 2]),
      line('And the Triforce is made whole', [0, 2, 5, 7, 8, 5, 1], [1, 1, 1, 1, 1, 1, 2]),
    ],
    boss: [
      line('The seal breaks and the demon wakes', [0, 2, 4, 6, 4, 7, 0, 0], [0.5, 0.5, 1, 1, 1, 1, 1, 2]),
      line('The darkness answers the light', [4, 6, 4, 2, 6, 3, 6], [0.5, 0.5, 1, 1, 1, 1, 3]),
    ],
    beat: ['B', null, 't', null, 'Pf', null, 't', 'm', 'B', null, 't', null, 'Pf', null, 't', null],
  },
};

/** A long vowel for the breakdown and the guardian's entrance. */
export const CANTICLE_DRONE = {
  text: 'ooh',
  degrees: [0],
  beats: [8],
};

/**
 * Hand-written syllables for the vocal effects. The dictionary is English words,
 * not interjections, so the engine's letter-to-sound rules would turn "ah" into
 * "æh"; these spell the moment out in IPA directly.
 */
const seg = (ipa) => ({ ipa, stress: 0 });
const sing = (text, onset, nucleus, coda = []) => ({
  text,
  onset: onset.map(seg),
  nucleus: { ipa: nucleus, stress: 1 },
  coda: coda.map(seg),
  wordEnd: true,
  phraseEnd: true,
});

export const CANTICLE_SFX = {
  shot: sing('ha', ['h'], 'a'),
  perfect: sing('hey', ['h'], 'eɪ'),
  grunt: sing('ah', [], 'ɑ'),
  high: sing('ti', ['t'], 'i'),
  low: sing('oh', [], 'o'),
  ooh: sing('ooh', [], 'u'),
  la: sing('la', ['l'], 'a'),
  mm: sing('mm', ['m'], 'u'),
};

/** Every line whose syllables are precomputed (keep in sync with scripts/build-canticle-lyrics.mjs). */
export function canticleLines() {
  const lines = [CANTICLE_DRONE];
  for (const stage of Object.values(CANTICLE)) {
    lines.push(...stage.rail, ...stage.boss);
  }
  return lines;
}

/** Scale degrees → MIDI. The singer sits between C4 and B4 (an octave lower for a tenor). */
export function singMidi(stageRoot, degree, scale, octaveShift = 0) {
  const step = scale[((degree % 7) + 7) % 7];
  const octaves = Math.floor(degree / 7);
  let base = stageRoot + 12;
  while (base < 60) base += 12;
  while (base > 71) base -= 12;
  return base + step + 12 * octaves + octaveShift;
}

/**
 * The octave closest to `octave` that keeps a line inside the comfortable vocal
 * range (MIDI 48–84). A climax transposes the line up an octave, but a line that
 * already reaches high (the castle's) would leave the voice's range doing it.
 */
export function fitOctave(stageRoot, scale, degrees, octave, bodyOctave, lo = 48, hi = 84) {
  const range = (o) => degrees.map((d) => singMidi(stageRoot, d, scale, bodyOctave + o));
  let o = octave;
  let notes = range(o);
  while (Math.max(...notes) > hi && o > octave - 24) {
    o -= 12;
    notes = range(o);
  }
  while (Math.min(...notes) < lo && o < octave + 24) {
    o += 12;
    notes = range(o);
  }
  return o;
}

/** The awaken level at which each sound joins the beat. */
export const BEAT_AWAKEN = {
  B: 1, Pf: 2, m: 1, t: 2, '!': 3, K: 4, tss: 5, kch: 6, '^K': 7, 'P!': 8,
};

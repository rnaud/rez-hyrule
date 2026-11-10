/**
 * Flavour text and track metadata for the codex, music room and Triforce gallery.
 */
import { STAGES } from './stages.js';

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const midiName = (midi) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

export const ENEMY_LORE = {
  keese: {
    tag: 'CAVE DWELLER',
    threat: 'LOW',
    lore: 'Keese gather where old magic pools. They are mostly wings and appetite, and they have never once learned patience.',
  },
  octorok: {
    tag: 'RIVER SNIPER',
    threat: 'LOW',
    lore: 'A river-dweller with a taste for sparks. It spits a single stone with enormous ceremony, then waits to see what happens.',
  },
  baba: {
    tag: 'DUNGEON FLORA',
    threat: 'MEDIUM',
    lore: 'Deku Babas root themselves in the bones of forgotten halls. The flower is beautiful. The flower is not the point.',
  },
  stalfos: {
    tag: 'THE UNQUIET',
    threat: 'MEDIUM',
    lore: 'Every Stalfos was a knight before it became a warning. The sword it carries is rusted; the oath is not.',
  },
  beamos: {
    tag: 'TEMPLE SENTINEL',
    threat: 'MEDIUM',
    lore: 'Built by hands that are long gone, the Beamos still keeps its post. It has not been told that the war is over.',
  },
  wizzrobe: {
    tag: 'ARCANE WANDERER',
    threat: 'HIGH',
    lore: 'Wizzrobes fold distance the way scholars fold paper. If you lose sight of one for two heartbeats, look somewhere impossible.',
  },
  armos: {
    tag: 'ARMORED IDOL',
    threat: 'HIGH',
    lore: 'A shrine guardian carved with the face of a forgotten hero. Its stone ward must be broken before the creature inside can be hurt.',
  },
  poe: {
    tag: 'LANTERN GHOST',
    threat: 'MEDIUM',
    lore: 'A Poe carries its own light through the dark. Strike while it is solid; its lantern knows how to be elsewhere.',
  },
  dekuScrub: {
    tag: 'SEED SLINGER',
    threat: 'MEDIUM',
    lore: 'Small, nervous and absolutely certain it is a hero. It fires three seeds at a time because two would be less heroic.',
  },
  likelike: {
    tag: 'RUPEE THIEF',
    threat: 'HIGH',
    lore: 'A Like Like has no interest in glory. It wants what glitters in your pouch. Let it slip away and it will take a share.',
  },
};

export const BOSS_LORE = {
  field: {
    name: 'GOHMA, THE CURSED EYE',
    tag: 'GUARDIAN OF THE GOLDEN PLAIN',
    lore: 'Something the field tried to bury. Gohma wears the old stones like a shell and opens its eyes only when the grass is quiet.',
  },
  woods: {
    name: 'THE ANCIENT BLOOM',
    tag: 'GUARDIAN OF THE HOLLOW LANTERN',
    lore: 'The first seed in the Lost Woods, grown grievance-shaped in the dark. Its petals remember every traveler the forest kept.',
  },
  mountain: {
    name: 'KING DODONGO, THE FURNACE',
    tag: 'GUARDIAN OF DEATH MOUNTAIN',
    lore: 'A king crowned in cinders. It was already sleeping under the caldera when the mountain learned to be a mountain.',
  },
  castle: {
    name: 'THE MALICE EYE · GANON',
    tag: 'THE THRONE’S LAST DREAM',
    lore: 'Not Ganon himself, but the shape his hatred made when the castle was hollowed. It rules a room that no longer has a king.',
  },
  sacred: {
    name: 'DEMISE · THE IMPRISONED',
    tag: 'THE TRUE FINAL GUARDIAN',
    lore: 'The oldest name on the oldest seal. Every age of Hyrule has been a reply to him. The Sacred Realm is only the last place he has left to lie.',
  },
};

export const POWER_INFO = {
  power: {
    name: 'DIN’S POWER',
    goddess: 'DIN',
    color: 'power',
    title: 'POWER',
    lore: 'The red fragment. Beams strike with twice the force against guardians and armor.',
  },
  courage: {
    name: 'FARORE’S COURAGE',
    goddess: 'FARORE',
    color: 'courage',
    title: 'COURAGE',
    lore: 'The green fragment. At the start of each rail, one ward blocks the next wound.',
  },
  wisdom: {
    name: 'NAYRU’S WISDOM',
    goddess: 'NAYRU',
    color: 'wisdom',
    title: 'WISDOM',
    lore: 'The blue fragment. Call Nayru’s Focus to slow malice to a crawl while you paint your locks.',
  },
};

export const FRAGMENT_INFO = {
  power: {
    name: 'POWER',
    goddess: 'DIN',
    lore: '“The fire at the heart of the world.”',
  },
  courage: {
    name: 'COURAGE',
    goddess: 'FARORE',
    lore: '“The wind that refuses the dark.”',
  },
  wisdom: {
    name: 'WISDOM',
    goddess: 'NAYRU',
    lore: '“The light that remembers the way.”',
  },
};

const MUSIC_MOODS = {
  field: 'GOLDEN GROVE',
  woods: 'LANTERN VESPERS',
  mountain: 'FURNACE MARCH',
  castle: 'MALICE MARCH',
  sacred: 'SACRED CHOIR',
};

export const MODE_INFO = {
  campaign: {
    title: 'CAMPAIGN',
    subtitle: 'Five rails. One legend.',
  },
  score: {
    title: 'SCORE ATTACK',
    subtitle: 'One rail. One chance to be remembered.',
  },
  bossrush: {
    title: 'BOSS RUSH',
    subtitle: 'Every guardian. No rail between.',
  },
  daily: {
    title: 'DAILY RAIL',
    subtitle: 'A shared seed of malice. Today’s stage, today’s glory.',
  },
  canticle: {
    title: 'THE CANTICLE',
    subtitle: 'Every sound on the rail is a voice, sung live.',
  },
};

const stageTrack = (stage, index) => ({
  id: `stage:${stage.id}`,
  kind: 'stage',
  rail: index + 1,
  stageId: stage.id,
  title: stage.name,
  subtitle: stage.epithet,
  bpm: stage.music.bpm,
  key: midiName(stage.music.root),
  mode: stage.music.mode.toUpperCase(),
  description: stage.chapter,
  mood: MUSIC_MOODS[stage.id],
  config: stage.music,
});

const bossTrack = (stage, index) => ({
  id: `boss:${stage.id}`,
  kind: 'boss',
  rail: index + 1,
  stageId: stage.id,
  title: stage.boss.shortName,
  subtitle: `GUARDIAN THEME · ${stage.name}`,
  bpm: stage.bossMusic?.bpm ?? stage.music.bpm,
  key: midiName(stage.bossMusic?.root ?? stage.music.root),
  mode: (stage.bossMusic?.mode ?? stage.music.mode).toUpperCase(),
  description: stage.boss.name,
  mood: MUSIC_MOODS[stage.id],
  config: stage.bossMusic ?? stage.music,
});

export const TRACKS = STAGES.flatMap((stage, index) => [stageTrack(stage, index), bossTrack(stage, index)]);

export const BESTIARY_ORDER = [
  'keese',
  'octorok',
  'baba',
  'stalfos',
  'beamos',
  'wizzrobe',
  'armos',
  'poe',
  'dekuScrub',
  'likelike',
];

export const POWER_ORDER = ['power', 'courage', 'wisdom'];

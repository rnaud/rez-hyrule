#!/usr/bin/env node
/**
 * Render a Canticle performance offline with the same voice engine and the same
 * plans the game schedules. Useful to audition the mode without a browser, and as
 * a pitch check: `--analyze` measures the sung f0 against the intended notes.
 *
 *   node scripts/render-canticle.mjs --stage field --seconds 24 --out shots/canticle-field.wav
 *   node scripts/render-canticle.mjs --stage castle --boss --analyze
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANTICLE, CANTICLE_BODIES, CANTICLE_DRONE, BEAT_AWAKEN, fitOctave, singMidi } from '../src/chimera/canticle.js';
import { CANTICLE_SYLLABLES } from '../src/chimera/lyrics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WASM = path.join(ROOT, 'public/chimera/chimera.wasm');

const SCALES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const QUALITIES = { m: [0, 3, 7, 10], M: [0, 4, 7, 11], d: [0, 3, 6, 9] };
const RATE = 48000;
const BLOCK = 128;

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const stageId = opt('stage', 'field');
const boss = flag('boss');
const bodyId = opt('body', 'female');
const seconds = Number(opt('seconds', '24'));
const out = path.resolve(ROOT, opt('out', `shots/canticle-${stageId}${boss ? '-boss' : ''}.wav`));
const analyze = flag('analyze');
const stageIndex = ['field', 'woods', 'mountain', 'castle', 'sacred'].indexOf(stageId);
if (stageIndex < 0 || !CANTICLE[stageId]) throw new Error(`unknown stage ${stageId}`);

// The game's stage music, mirrored (stages.js keeps the source of truth).
const MUSIC = {
  field: { bpm: 124, root: 50, mode: 'dorian', progression: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']] },
  woods: { bpm: 116, root: 45, mode: 'aeolian', progression: [[0, 'm'], [7, 'm'], [8, 'M'], [10, 'M']] },
  mountain: { bpm: 132, root: 48, mode: 'phrygian', progression: [[0, 'm'], [8, 'M'], [10, 'M'], [7, 'M']] },
  castle: { bpm: 140, root: 43, mode: 'harmonic', progression: [[0, 'm'], [8, 'M'], [10, 'M'], [7, 'M']] },
  sacred: { bpm: 144, root: 50, mode: 'lydian', progression: [[0, 'M'], [7, 'M'], [5, 'M'], [2, 'm']] },
};
const BOSS = {
  field: { bpm: 138, root: 48, mode: 'phrygian', progression: [[0, 'm'], [1, 'M'], [0, 'm'], [10, 'M']] },
  woods: { bpm: 126, root: 43, mode: 'aeolian', progression: [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'm']] },
  mountain: { bpm: 142, root: 40, mode: 'phrygian', progression: [[0, 'm'], [1, 'M'], [8, 'M'], [10, 'M']] },
  castle: { bpm: 150, root: 38, mode: 'harmonic', progression: [[0, 'm'], [8, 'M'], [7, 'M'], [1, 'M']] },
  sacred: { bpm: 156, root: 36, mode: 'phrygian', progression: [[0, 'm'], [0, 'M'], [0, 'm'], [10, 'M']] },
};
const music = boss ? BOSS[stageId] : MUSIC[stageId];
const body = CANTICLE_BODIES[bodyId];
const scale = SCALES[music.mode];
const beatDur = 60 / music.bpm;
const barDur = beatDur * 4;

const mod = await WebAssembly.compile(fs.readFileSync(WASM));
const ex = (await WebAssembly.instantiate(mod, {})).exports;
const enc = new TextEncoder();
const dec = new TextDecoder();
const mem = () => ex.memory.buffer;

function json(fn, payload = {}) {
  const bytes = enc.encode(JSON.stringify({ fn, ...payload }));
  const p = ex.chimera_alloc(bytes.length);
  new Uint8Array(mem(), p, bytes.length).set(bytes);
  const status = ex.chimera_call(p, bytes.length);
  ex.chimera_free(p, bytes.length);
  const value = JSON.parse(dec.decode(new Uint8Array(mem(), ex.chimera_result_ptr(), ex.chimera_result_len())));
  if (status !== 0) throw new Error(value.error || `${fn} failed`);
  return value;
}

const CONTROL_KEYS = [
  'jaw', 'tbX', 'tbY', 'ttX', 'ttY', 'ttCurl', 'root', 'lipAp', 'lipProt', 'lipWidth',
  'labiodental', 'velum', 'larynx', 'epilarynx', 'ventricular', 'lateral', 'dorsum',
  'abduction', 'closure', 'breath', 'f0', 'vibrato',
];
function writeGestures(handle, gestures, count = gestures.length) {
  const at = ex.engine_records(handle);
  const dv = new DataView(mem(), at, count * 272);
  for (let i = 0; i < count; i++) {
    const g = gestures[i];
    const o = i * 272;
    const head = [g.t0, g.t1, g.rampIn, g.rampOut, g.strength, g.speed ?? NaN, g.releaseHold ?? NaN, g.tag ?? NaN];
    for (let j = 0; j < 8; j++) dv.setFloat64(o + j * 8, head[j], true);
    for (let k = 0; k < CONTROL_KEYS.length; k++) dv.setFloat64(o + 64 + k * 8, NaN, true);
    for (const [key, value] of Object.entries(g.targets || {})) {
      const k = CONTROL_KEYS.indexOf(key);
      if (k >= 0 && value !== undefined) dv.setFloat64(o + 64 + k * 8, value, true);
    }
    dv.setUint8(o + 240, 255);
  }
  return at;
}
function writeSteps(handle, steps) {
  const at = ex.engine_records(handle);
  const dv = new DataView(mem(), at, steps.length * 48);
  const bytes = new Uint8Array(mem(), at, steps.length * 48);
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const o = i * 48;
    if (!s) { bytes[o] = 255; continue; }
    const id = enc.encode(s.id);
    bytes[o] = id.length;
    bytes.set(id, o + 1);
    dv.setFloat64(o + 32, s.note ?? NaN, true);
    dv.setFloat64(o + 40, s.accent ?? NaN, true);
  }
  return steps.length;
}

// ---- the two voices, exactly as the game builds them
const cantor = ex.engine_new(RATE);
const beat = ex.engine_new(RATE);
ex.engine_set_body(cantor, body.mix.female, body.mix.child);
ex.engine_set_body(beat, body.mix.female, body.mix.child);

const startAt = 0.5;
const linePlan = (line, octave, vibrato) => {
  const syl = CANTICLE_SYLLABLES[line.text];
  const notes = line.degrees.map((d, i) => ({
    midi: singMidi(music.root, d, scale, octave + body.octave),
    beats: line.beats[i],
    syl: syl[i],
  }));
  return { plan: json('planSong', { notes, options: { body: body.mix, bpm: music.bpm, t0: 0.35, vibrato } }), notes };
};

const expected = []; // { t, hz, midi } vowel onsets for the pitch check

const data = CANTICLE[stageId];
const lines = boss ? data.boss : data.rail;
for (let bar = 0; bar < 64; bar += 2) {
  const t = startAt + bar * barDur;
  if (t > seconds) break;
  const form = Math.floor(bar / 8) % 4;
  const phraseIndex = Math.floor(bar / 2) % 4;
  let line = form === 2 ? CANTICLE_DRONE : lines[phraseIndex % lines.length];
  let octave = form === 2 ? -12 : 0;
  if (form === 3) octave += 12;
  octave = fitOctave(music.root, scale, line.degrees, octave, body.octave);
  const { plan, notes } = linePlan(line, octave, 35);
  const at = writeGestures(cantor, plan.gestures);
  ex.engine_schedule(cantor, plan.gestures.length, t - 0.35, 0);
  let tNote = t;
  for (const n of notes) {
    expected.push({ t: tNote, midi: n.midi, hz: 440 * Math.pow(2, (n.midi - 69) / 12), text: n.syl.text });
    tNote += n.beats * beatDur;
  }
  // The line's own vowel onsets, from the plan's schedule times
  void at;
}

// beatbox: the same 8-bar pattern the game builds
const pattern = data.beat;
const prog = music.progression;
const steps = [];
for (let b = 0; b < 8; b++) {
  const [offset] = prog[b % prog.length];
  for (let s = 0; s < 16; s++) {
    let id = pattern[s] || null;
    if (!id) { steps.push(null); continue; }
    if ((BEAT_AWAKEN[id] ?? 1) > 9) { steps.push(null); continue; }
    steps.push(id === 'm' ? { id, note: music.root + offset - 12, accent: 1 } : { id });
  }
}
writeSteps(beat, steps);

const frames = Math.ceil(seconds * RATE);
const cantorOut = new Float32Array(frames);
const beatOut = new Float32Array(frames);
// The beat player anchors 0.2 s after it is told to play: start it early enough
// that its bar 0 lands on the singer's first downbeat.
const pre = Math.max(0, Math.round((startAt - 0.2) * RATE));
for (let pos = 0; pos < pre; pos += BLOCK) {
  const n = Math.min(BLOCK, pre - pos);
  ex.engine_render(cantor, n);
  ex.engine_render(beat, n);
}
ex.engine_set_beat(beat, 1, steps.length, music.bpm, 0.07, 1);
for (let pos = pre; pos < frames; pos += BLOCK) {
  const n = Math.min(BLOCK, frames - pos);
  const p1 = ex.engine_render(cantor, n);
  cantorOut.set(new Float32Array(mem(), p1, n), pos);
  const p2 = ex.engine_render(beat, n);
  beatOut.set(new Float32Array(mem(), p2, n), pos);
}

// A close-mic mix: the beatbox is hotter than a vowel, as in CanticleAudio.
const mix = new Float32Array(frames);
let peak = 0;
for (let i = 0; i < frames; i++) {
  const v = cantorOut[i] * 0.85 + beatOut[i] * 4.5;
  mix[i] = v;
  peak = Math.max(peak, Math.abs(v));
}
const norm = peak > 0 ? 0.92 / peak : 1;
for (let i = 0; i < frames; i++) mix[i] *= norm;

fs.mkdirSync(path.dirname(out), { recursive: true });
const wav = Buffer.alloc(44 + frames * 4);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + frames * 4, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(frames * 4, 40);
for (let i = 0; i < frames; i++) {
  const s = Math.max(-1, Math.min(1, mix[i]));
  wav.writeInt16LE(Math.round(s * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(s * 32767), 46 + i * 4);
}
fs.writeFileSync(out, wav);
console.log(`wrote ${path.relative(ROOT, out)} — ${seconds.toFixed(1)}s ${stageId}${boss ? ' (guardian)' : ''} ${bodyId}`);

if (analyze) {
  // Normalised autocorrelation f0 per 40 ms frame on the isolated cantor.
  const frame = 4096;
  const hop = 1024;
  const lo = Math.floor(RATE / 1100);
  const hi = Math.ceil(RATE / 65);
  const results = [];
  for (let pos = 0; pos + frame < frames; pos += hop) {
    let rms = 0;
    for (let i = 0; i < frame; i++) rms += cantorOut[pos + i] ** 2;
    rms = Math.sqrt(rms / frame);
    if (rms < 0.004) continue;
    let best = 0;
    let bestLag = 0;
    for (let lag = lo; lag < hi; lag++) {
      let sum = 0;
      for (let i = 0; i < frame - lag; i++) sum += cantorOut[pos + i] * cantorOut[pos + i + lag];
      const norm = sum / (frame - lag);
      if (norm > best) { best = norm; bestLag = lag; }
    }
    if (bestLag) results.push({ t: pos / RATE, f0: RATE / bestLag });
  }
  const cents = (a, b) => Math.abs(1200 * Math.log2(a / b));
  const errors = [];
  for (const r of results) {
    // the note sounding at this instant
    const live = expected.filter((e) => e.t <= r.t + 0.03).sort((a, b) => b.t - a.t)[0];
    if (!live) continue;
    const err = Math.min(cents(r.f0, live.hz), cents(r.f0, live.hz * 2), cents(r.f0, live.hz / 2));
    errors.push(err);
  }
  errors.sort((a, b) => a - b);
  const median = errors[Math.floor(errors.length / 2)] || 0;
  const within50 = errors.filter((e) => e < 50).length;
  const raw = results.map((r) => {
    const live = expected.filter((e) => e.t <= r.t + 0.03).sort((a, b) => b.t - a.t)[0];
    return live ? cents(r.f0, live.hz) : NaN;
  }).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  console.log(`pitch: ${results.length} voiced frames, median ${(raw[Math.floor(raw.length / 2)] || 0).toFixed(1)} cents ` +
    `from the score (${((within50 / Math.max(1, errors.length)) * 100).toFixed(0)}% within 50 cents, octave-tolerant)`);
  console.log('first notes:', expected.slice(0, 8).map((e) => `${e.text}@${e.hz.toFixed(0)}Hz`).join(' '));
}

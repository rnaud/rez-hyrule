/**
 * THE CANTICLE — the game's score performed by the CHIMERA physical-model voice.
 *
 * Two voices run in real time, each an AudioWorklet with its own copy of the Rust
 * engine: a cantor who sings the stage's lyric line with consonants, legato and
 * vibrato, and a beatboxer who plays the percussion and the hummed bass. Every
 * sound the mode makes — shots, impacts, the guardian's roar, the menu — is one of
 * those two voices; there are no oscillators or samples anywhere in this file.
 *
 * Public surface mirrors AudioEngine so Game can swap the two without branching.
 *
 * Timing: the beatboxer's own step sequencer runs on the engine's sample clock, so
 * the drums never drift. The cantor's phrases are planned once per line (planSong)
 * and scheduled ahead of the bar with a lead computed from the audio clock, so the
 * first vowel lands on the downbeat.
 */
import { initChimera, chimeraModule, planSong, bodyFor } from './engine.js';
import {
  CANTICLE,
  CANTICLE_BODIES,
  CANTICLE_DRONE,
  CANTICLE_SFX,
  BEAT_AWAKEN,
  fitOctave,
  singMidi,
} from './canticle.js';
import { syllablesFor } from './lyrics.js';

const SCALES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const QUALITIES = {
  m: [0, 3, 7, 10],
  M: [0, 4, 7, 11],
  d: [0, 3, 6, 9],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** plan time of a one-shot effect's vowel: how far ahead it must be scheduled */
const EFFECT_LEAD = 0.08;
const BAR = 4;
const BLOCK = 8;

/** One AudioWorklet voice: a node, its engine, and the messages it takes. */
class ChimeraVoice {
  constructor(ctx, module, options = {}) {
    this.ctx = ctx;
    this.node = new AudioWorkletNode(ctx, 'chimera', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { module, statsEvery: 12 },
    });
    this.gain = ctx.createGain();
    this.gain.gain.value = options.gain ?? 0.8;
    this.node.connect(this.gain);
    this.load = 0;
    this.loadAvg = 0;
    this.clock = 0;
    this.ready = new Promise((resolve, reject) => {
      this.node.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') {
          this.info = m;
          resolve(m);
        } else if (m.type === 'stats') {
          this.load = m.load;
          this.loadAvg = m.loadAvg;
          this.clock = m.clock;
        } else if (m.type === 'error') {
          this.error = m.message;
          reject(new Error(m.message));
        }
      };
    });
    this.ready.catch(() => {});
  }

  send(m) {
    if (this.dead) return;
    this.node.port.postMessage(m);
  }

  body(mix) {
    this.send({ type: 'body', body: mix });
  }

  schedule(gestures, lead = 0.03) {
    this.send({ type: 'schedule', gestures, lead, replace: false });
  }

  release(tag) {
    this.send({ type: 'release', tag });
  }

  stopSpeech() {
    this.send({ type: 'stopSpeech' });
  }

  beat(message) {
    this.send({ type: 'beat', ...message });
  }

  beatHit(id, note, accent) {
    this.send({ type: 'beatHit', id, note, accent });
  }

  stop() {
    this.dead = true;
    try {
      this.node.disconnect();
    } catch {
      /* already gone */
    }
    this.gain.disconnect();
  }
}

export class CanticleAudio {
  /**
   * @param {object} options
   * @param {string} [options.voice] 'female' | 'male' | 'child'
   * @param {'ensemble'|'cantor'} [options.ensemble] drop the beatboxer on slow devices
   * @param {(notice: {type: string, text: string}) => void} [options.onNotice]
   */
  constructor(options = {}) {
    this.ctx = null;
    this.readyPromise = null;
    this.started = false;
    this.muted = false;
    this.musicVolume = 0.7;
    this.sfxVolume = 0.85;
    this.beatDur = 0.5;
    this.stepDur = 0.125;
    this.musicStart = 0;
    this.stage = null;
    this.boss = false;
    this.bossPhase = 1;
    this.awaken = 1;
    this.barIndex = 0;
    this.nextBarTime = 0;
    this.load = 0;
    this.degraded = false;
    this.onNotice = options.onNotice || (() => {});
    this.voiceName = CANTICLE_BODIES[options.voice] ? options.voice : 'female';
    this.ensemble = options.ensemble === 'cantor' ? 'cantor' : 'ensemble';
    this._timer = null;
    this._plans = new Map();
    this._lyric = null;
    this._pendingBeat = null;
    this._beatStarted = false;
    this._beatTier = -1;
    this._highLoad = 0;
  }

  /* ---------------------------------------------------------------- */
  /* lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  get available() {
    return !!this.ctx;
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  get bodyMix() {
    return bodyFor(this.voiceName);
  }

  /** Compile the engine, open the audio graph and build the voices (once). */
  ready() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this._init();
    return this.readyPromise;
  }

  async _init() {
    if (typeof AudioWorkletNode === 'undefined' || !(window.AudioContext || window.webkitAudioContext)) {
      throw new Error('this browser has no AudioWorklet');
    }
    await initChimera();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    await ctx.audioWorklet.addModule(await this._workletModuleUrl());
    this._buildGraph();
    const module = chimeraModule();
    this.cantor = new ChimeraVoice(ctx, module, { gain: 0.95 });
    this.cantor.gain.connect(this.mic);
    this.cantor.gain.connect(this.reverbSend);
    this.beatbox = null;
    if (this.ensemble === 'ensemble') {
      this.beatbox = new ChimeraVoice(ctx, module, { gain: 0.85 });
      this.beatbox.gain.connect(this.mic);
    }
    const mix = this.bodyMix;
    this.cantor.body(mix);
    this.beatbox?.body(mix);
    const ready = [this.cantor.ready];
    if (this.beatbox) ready.push(this.beatbox.ready);
    // A processor whose constructor throws never posts `ready`; do not leave the
    // "waking the voice" screen waiting forever.
    let timeout;
    await Promise.race([
      Promise.all(ready),
      new Promise((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error('the voice did not answer')), 20_000);
      }),
    ]).finally(() => window.clearTimeout(timeout));
    this.cantor.gain.gain.value = 0.95 * 0.9;
    // The beatbox's gestures are much quieter than a sustained vowel at the same
    // gain; the close-mic compressor in front of them keeps the peaks in check.
    if (this.beatbox) this.beatbox.gain.gain.value = 4.5;
    this._timer = setInterval(() => this._tick(), 25);
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* the next gesture resumes it */
      }
    }
  }

  /**
   * The worklet is a plain script in public/. `audioWorklet.addModule` fetches it
   * outside the service worker's reach, so an offline session would fail; fetching
   * the source here (which the service worker does cache) and registering it from a
   * blob keeps The Canticle playable with no network.
   */
  async _workletModuleUrl() {
    const url = new URL('chimera/worklet.js', document.baseURI).href;
    try {
      const res = await fetch(url);
      if (!res.ok) return url;
      const source = await res.text();
      const blob = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      window.setTimeout(() => URL.revokeObjectURL(blob), 30_000);
      return blob;
    } catch {
      return url;
    }
  }

  _buildGraph() {
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 14;
    comp.ratio.value = 3.4;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.78;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    // A close-mic chain: the voice is produced, not a dry lab signal.
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'lowshelf';
    shelf.frequency.value = 140;
    shelf.gain.value = 5;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 3200;
    presence.Q.value = 0.8;
    presence.gain.value = 3;
    const micComp = ctx.createDynamicsCompressor();
    micComp.threshold.value = -24;
    micComp.knee.value = 8;
    micComp.ratio.value = 4;
    micComp.attack.value = 0.003;
    micComp.release.value = 0.14;
    const makeup = ctx.createGain();
    makeup.gain.value = 1.7;
    shelf.connect(presence);
    presence.connect(micComp);
    micComp.connect(makeup);
    this.vocalBus = ctx.createGain();
    this.vocalBus.gain.value = this.musicVolume;
    makeup.connect(this.vocalBus);
    this.vocalBus.connect(master);
    this.mic = shelf;

    // A long, glassy plate for the sung line.
    const conv = ctx.createConvolver();
    conv.buffer = this._makeImpulse(3.1, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.34;
    conv.connect(wet);
    wet.connect(this.vocalBus);
    this.reverb = conv;
    const send = ctx.createGain();
    send.gain.value = 0.5;
    send.connect(conv);
    this.reverbSend = send;
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - Math.exp(-i / 240));
      }
    }
    return buf;
  }

  /** Start (or resume) the audio context; called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      this.ready().catch((error) => {
        this.error = String(error?.message || error);
      });
      return;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  pause() {
    if (this.ctx?.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setVolumes(music, sfx) {
    if (Number.isFinite(music)) this.musicVolume = clamp(music, 0, 1);
    if (Number.isFinite(sfx)) this.sfxVolume = clamp(sfx, 0, 1);
    if (this.vocalBus) this.vocalBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.78, t, 0.05);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setVoice(name) {
    if (!CANTICLE_BODIES[name] || name === this.voiceName) return;
    this.voiceName = name;
    this._plans.clear();
    const mix = this.bodyMix;
    this.cantor?.body(mix);
    this.beatbox?.body(mix);
  }

  /* ---------------------------------------------------------------- */
  /* beat clock                                                        */
  /* ---------------------------------------------------------------- */

  getBeatInfo() {
    if (!this.ctx || !this.started) return { beat: 0, bar: 0, step: 0, phase: 0, playing: false };
    const elapsed = Math.max(0, (this.ctx.currentTime - this.musicStart) / this.beatDur);
    return {
      beat: elapsed,
      bar: Math.floor(elapsed / 4),
      step: Math.floor(elapsed * 4),
      phase: elapsed % 1,
      playing: this.started,
    };
  }

  beatError() {
    if (!this.ctx || !this.started) return 99;
    const elapsed = (this.ctx.currentTime - this.musicStart) / this.beatDur;
    const frac = elapsed - Math.round(elapsed);
    return Math.abs(frac) * this.beatDur;
  }

  isOnBeat(tolerance = 0.1) {
    return this.beatError() < tolerance;
  }

  /* ---------------------------------------------------------------- */
  /* the score                                                         */
  /* ---------------------------------------------------------------- */

  startStage(config) {
    this._start(config, false);
    this.boss = false;
    this.bossPhase = 1;
  }

  startBossTheme(config) {
    this._start(config, true);
    this.boss = true;
    this.bossPhase = 1;
    this._roar();
  }

  _start(config, boss) {
    if (!this.ctx || !config) return;
    // cancel any fade-out still waiting to stop the previous stage's voices
    this._stopToken = (this._stopToken || 0) + 1;
    this.stage = config;
    this.bpm = clamp(Number(config.bpm) || 120, 50, 200);
    this.beatDur = 60 / this.bpm;
    this.stepDur = this.beatDur / 4;
    this.musicStart = this.ctx.currentTime + 0.55;
    this.barIndex = 0;
    this.nextBarTime = this.musicStart;
    this.started = true;
    this.boss = !!boss;
    this.awaken = clamp(this.awaken || 1, 1, 10);
    this._beatStarted = false;
    this._beatTier = -1;
    this._pendingBeat = null;
    this._lyric = null;
    this._highLoad = 0;
    this._plans.clear();
    const t = this.ctx.currentTime;
    this.vocalBus.gain.cancelScheduledValues(t);
    this.vocalBus.gain.setTargetAtTime(this.musicVolume, t, 0.12);
    this.cantor?.stopSpeech();
    this.beatbox?.beat({ playing: false });
  }

  setAwaken(level) {
    this.awaken = clamp(Math.round(level) || 1, 1, 10);
  }

  setBoss(isBoss) {
    this.boss = !!isBoss;
  }

  setBossPhase(phase) {
    this.bossPhase = clamp(Number(phase) || 1, 1, 3);
  }

  stopMusic(fade = 1.2) {
    this.started = false;
    this._lyric = null;
    this._pendingBeat = null;
    const token = ++this._stopToken;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.vocalBus.gain.cancelScheduledValues(t);
    this.vocalBus.gain.setTargetAtTime(0.0001, t, Math.max(0.02, fade / 3));
    window.setTimeout(() => {
      if (token !== this._stopToken) return;
      this.cantor?.stopSpeech();
      this.beatbox?.beat({ playing: false });
      this.beatbox?.stopSpeech();
    }, Math.max(60, fade * 800));
  }

  stopDrone() {
    /* the voice has no drone layer; kept for the shared interface */
  }

  clearVolley() {
    /* sung notes end by themselves */
  }

  /* ---------------------------------------------------------------- */
  /* scheduler                                                         */
  /* ---------------------------------------------------------------- */

  _tick() {
    if (!this.ctx || !this.started) {
      this._watchdog();
      return;
    }
    const now = this.ctx.currentTime;

    // The beatboxer's sequencer is anchored once, on the sample clock.
    if (!this._beatStarted && now >= this.musicStart - 0.24) {
      this._beatStarted = true;
      this._beatTier = this.awaken;
      this.beatbox?.beat({
        steps: this._buildBeat(0),
        bpm: this.bpm,
        swing: this.boss ? 0.04 : 0.07,
        playing: true,
      });
    }

    // A pattern swap lands a little before the bar it belongs to (the engine
    // schedules hits 0.2 s ahead, so this is early enough to take effect).
    if (this._pendingBeat && now >= this._pendingBeat.at) {
      this.beatbox?.beat({ steps: this._pendingBeat.steps });
      this._pendingBeat = null;
    }

    while (this.nextBarTime < now + 0.55) {
      this._scheduleBar(this.barIndex, this.nextBarTime);
      this.barIndex += 1;
      this.nextBarTime += this.beatDur * BAR;
    }
    this._watchdog();
  }

  _scheduleBar(bar, time) {
    const form = Math.floor(bar / BLOCK) % 4;
    if (bar % 2 === 0 && this.beatbox) {
      const block = Math.floor(bar / BLOCK) * BLOCK;
      if (bar % BLOCK === 0 || this.awaken !== this._beatTier) {
        this._beatTier = this.awaken;
        this._pendingBeat = { at: time - 0.3, steps: this._buildBeat(block) };
      }
    }
    if (bar % 2 === 0) this._schedulePhrase(bar, time, form);
  }

  _schedulePhrase(bar, time, form) {
    const data = CANTICLE[this.stage?.style];
    if (!data) return;
    const phraseIndex = Math.floor(bar / 2) % 4;
    let line = CANTICLE_DRONE;
    let octave = 0;
    if (form !== 2) {
      const lines = this.boss ? data.boss : data.rail;
      line = lines[phraseIndex % lines.length];
    } else {
      octave = -12;
    }
    if (form === 3) octave += 12;
    if (this.boss && this.bossPhase >= 3) octave += 12;
    const scale = SCALES[this.stage?.mode] || SCALES.aeolian;
    octave = fitOctave(this.stage.root, scale, line.degrees, octave, CANTICLE_BODIES[this.voiceName].octave);
    this._singLine(line, octave, time, form === 2 ? 18 : this.boss ? 28 : 35);
  }

  _singLine(line, octave, startTime, vibrato) {
    if (!this.cantor || !this.ctx) return;
    const syl = syllablesFor(line.text);
    if (!syl || syl.length !== line.degrees.length) return;
    const body = CANTICLE_BODIES[this.voiceName];
    const key = `${line.text}|${this.stage.root}|${this.stage.mode}|${octave}|${this.bpm.toFixed(3)}|${this.voiceName}|${vibrato}|${this.boss ? 'b' : 'r'}`;
    let plan = this._plans.get(key);
    if (!plan) {
      const scale = SCALES[this.stage.mode] || SCALES.aeolian;
      const notes = line.degrees.map((degree, i) => ({
        midi: singMidi(this.stage.root, degree, scale, octave + body.octave),
        beats: line.beats[i],
        syl: syl[i],
      }));
      try {
        plan = planSong(notes, { body: body.mix, bpm: this.bpm, t0: 0.35, vibrato });
      } catch (error) {
        this.onNotice({ type: 'error', text: String(error.message || error) });
        return;
      }
      const times = [];
      let t = 0;
      for (const beats of line.beats) {
        times.push(t);
        t += beats * this.beatDur;
      }
      plan.times = times;
      plan.lineText = line.text;
      plan.lineSyllables = syl;
      this._plans.set(key, plan);
    }
    const now = this.ctx.currentTime;
    const lead = startTime - 0.35 - now;
    if (lead < 0.02) return;
    this.cantor.schedule(plan.gestures, lead);
    this._lyric = {
      text: plan.lineText,
      syllables: plan.lineSyllables,
      times: plan.times,
      start: startTime,
      end: startTime + plan.end - 0.35,
    };
  }

  /** The syllable under the playhead, for the karaoke line. */
  lyricNow() {
    const l = this._lyric;
    if (!l || !this.ctx || !this.started) return null;
    const t = this.ctx.currentTime - l.start;
    // A phrase is scheduled a fraction of a second before it begins: show its
    // words already (nothing lit) so the line never blinks between phrases.
    if (t < -0.7 || t > l.end - l.start + 0.6) return null;
    let index = -1;
    for (let i = 0; i < l.times.length; i++) {
      if (t >= l.times[i]) index = i;
      else break;
    }
    return { text: l.text, syllables: l.syllables, active: index };
  }

  /* ---------------------------------------------------------------- */
  /* beatbox patterns                                                  */
  /* ---------------------------------------------------------------- */

  /** The 8-bar pattern for the block starting at `blockStart` (bar-aligned). */
  _buildBeat(blockStart) {
    const data = CANTICLE[this.stage?.style];
    const steps = [];
    const pattern = data?.beat || [];
    const prog = this.stage?.progression || [[0, 'm']];
    const root = this.stage?.root ?? 50;
    for (let b = 0; b < BLOCK; b++) {
      const [offset, quality] = prog[(blockStart + b) % prog.length];
      const chordRoot = root + offset;
      const bossBar = this.boss && b % 4 === 3;
      const phase = this.boss ? this.bossPhase : 1;
      for (let s = 0; s < 16; s++) {
        let id = pattern[s] || null;
        if (this.boss) {
          if (id === null && phase >= 2 && s === 10) id = 'B';
          if (id === null && phase >= 3 && b % 2 === 1 && s === 6) id = 'Pf';
          if (bossBar && phase >= 2 && s === 15) id = 'kch';
        }
        if (!id) {
          steps.push(null);
          continue;
        }
        if ((BEAT_AWAKEN[id] ?? 1) > this.awaken) {
          steps.push(null);
          continue;
        }
        if (id === 'm') {
          steps.push({ id, note: chordRoot - 12, accent: 1 });
        } else {
          steps.push({ id });
        }
      }
    }
    return steps;
  }

  _chordNow(time = this.ctx?.currentTime ?? 0) {
    if (!this.stage) return { root: 50, offset: 0, quality: 'm' };
    const bar = Math.max(0, Math.floor((time - this.musicStart) / (this.beatDur * BAR)));
    const prog = this.stage.progression || [[0, 'm']];
    const [offset, quality] = prog[bar % prog.length];
    return { root: this.stage.root, offset, quality };
  }

  /* ---------------------------------------------------------------- */
  /* player voices                                                     */
  /* ---------------------------------------------------------------- */

  playVolley(count, onBeat = false, chain = 0) {
    if (!this.ctx || !this.started || count <= 0) return;
    const now = this.ctx.currentTime;
    // Leave the planner its lead-in: the next sixteenth the singer can still make.
    const start = this.musicStart + Math.ceil((now + 0.12 - this.musicStart) / this.stepDur) * this.stepDur;
    const chord = this._chordNow(start + 0.05);
    const quality = QUALITIES[chord.quality] || QUALITIES.m;
    const lift = chain >= 7 ? 12 : chain >= 3 ? 6 : 0;
    for (let i = 0; i < count; i++) {
      let note = chord.root + chord.offset + quality[i % 3] + 24 + lift;
      while (note > 84) note -= 12;
      while (note < 62) note += 12;
      const at = start + i * this.stepDur;
      this._singShort(onBeat ? CANTICLE_SFX.perfect : CANTICLE_SFX.shot, note, at, onBeat ? 0.42 : 0.26, onBeat ? 55 : 18);
    }
  }

  /**
   * One syllable at `at` on the audio clock. The plan's first vowel sits at
   * `EFFECT_LEAD`; a call closer than that cannot be sung (it would start in the
   * past), so the caller must leave at least a tenth of a second.
   */
  _singShort(syl, midi, at, beats, vibrato = 18) {
    if (!this.ctx || !this.cantor) return;
    const now = this.ctx.currentTime;
    const key = `s|${syl.text}|${midi}|${beats}|${vibrato}|${this.bpm.toFixed(2)}`;
    let plan = this._plans.get(key);
    if (!plan) {
      try {
        plan = planSong([{ midi, beats, syl }], { body: this.bodyMix, bpm: this.bpm || 120, t0: EFFECT_LEAD, vibrato });
      } catch {
        return;
      }
      this._plans.set(key, plan);
    }
    const lead = at - EFFECT_LEAD - now;
    if (lead < 0.005) return;
    this.cantor.schedule(plan.gestures, lead);
  }

  _singNow(syl, midi, beats = 0.3, vibrato = 12) {
    if (!this.ctx) return;
    this._singShort(syl, midi, this.ctx.currentTime + EFFECT_LEAD + 0.03, beats, vibrato);
  }

  /* ---------------------------------------------------------------- */
  /* effects — all vocal                                               */
  /* ---------------------------------------------------------------- */

  _hit(id, accent = 1) {
    if (this.beatbox) {
      this.beatbox.beatHit(id, undefined, accent * (0.4 + this.sfxVolume * 0.6));
      return true;
    }
    return false;
  }

  lockBlip(count = 1) {
    if (!this.ctx) return;
    if (!this._hit('!', 0.5 + count * 0.12)) this._singNow(CANTICLE_SFX.high, 74 + count * 2, 0.12);
  }

  fireWhoosh() {
    if (!this.ctx) return;
    if (!this._hit('tss', 0.8)) this._singNow(CANTICLE_SFX.shot, 70, 0.18);
  }

  explode(size = 1) {
    if (!this.ctx) return;
    const big = size >= 2;
    this._hit('kch', big ? 1 : 0.7);
    if (big) this._hit('B', 1);
    if (!this.beatbox) {
      // a crash is an open-mouthed shout, then the chest of the blast
      this._singNow(CANTICLE_SFX.shot, big ? 50 : 57, big ? 0.5 : 0.3, 8);
      this._singNow(CANTICLE_SFX.grunt, big ? 38 : 45, big ? 0.7 : 0.4, 4);
    }
  }

  hitMarker() {
    if (!this._hit('K', 0.7)) this._singNow(CANTICLE_SFX.high, 79, 0.1, 6);
  }

  wardClang() {
    if (!this._hit('P!', 0.9)) this._singNow(CANTICLE_SFX.high, 86, 0.18);
    else this._singNow(CANTICLE_SFX.high, 86, 0.16, 40);
  }

  damage() {
    if (!this.ctx) return;
    this._hit('^K', 1);
    this._singNow(CANTICLE_SFX.grunt, 45, 0.5, 4);
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + EFFECT_LEAD + 0.03;
    [0, 1, 2].forEach((i) => this._singShort(CANTICLE_SFX.ooh, [72, 76, 79][i], t + i * 0.075, 0.12, 30));
  }

  awakenChord() {
    if (!this.ctx) return;
    const chord = this._chordNow();
    const quality = QUALITIES[chord.quality] || QUALITIES.m;
    const t = this.ctx.currentTime + EFFECT_LEAD + 0.03;
    quality.forEach((iv, i) => {
      let note = chord.root + chord.offset + iv + 12;
      while (note < 60) note += 12;
      this._singShort(CANTICLE_SFX.ooh, note, t + i * 0.07, 0.65, 42);
    });
  }

  bossRoar() {
    this._roar();
  }

  _roar() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._hit('kch', 1);
    this._hit('B', 1);
    const root = (this.stage?.root ?? 45) - 12;
    this._singShort(CANTICLE_SFX.grunt, root, now + EFFECT_LEAD + 0.03, 1.6, 4);
    this._singShort(CANTICLE_SFX.grunt, root + 12, now + EFFECT_LEAD + 0.05, 1.4, 2);
  }

  fanfare() {
    if (!this.ctx) return;
    const notes = [60, 64, 67, 72, 67, 72, 76];
    const t = this.ctx.currentTime + EFFECT_LEAD + 0.03;
    notes.forEach((note, i) => this._singShort(CANTICLE_SFX.la, note, t + i * 0.13, 0.22, 30));
    this._hit('tss', 0.7);
  }

  defeat() {
    if (!this.ctx) return;
    const notes = [55, 51, 48, 43];
    const t = this.ctx.currentTime + EFFECT_LEAD + 0.03;
    notes.forEach((note, i) => this._singShort(CANTICLE_SFX.low, note, t + i * 0.34, 0.7, 10));
  }

  uiHover() {
    if (!this.ctx) return;
    if (!this._hit('!', 0.22)) this._singNow(CANTICLE_SFX.mm, 76, 0.08, 6);
  }

  uiConfirm() {
    if (!this.ctx) return;
    if (!this._hit('P!', 0.45)) this._singNow(CANTICLE_SFX.high, 79, 0.14, 18);
    else this._singShort(CANTICLE_SFX.mm, 83, this.ctx.currentTime + EFFECT_LEAD + 0.03, 0.1, 6);
  }

  /* ---------------------------------------------------------------- */
  /* load protection                                                   */
  /* ---------------------------------------------------------------- */

  _watchdog() {
    const load = Math.max(this.cantor?.load || 0, this.beatbox?.load || 0);
    this.load = load;
    if (!this.started || this.ensemble !== 'ensemble' || this.degraded) return;
    if (load > 0.9) {
      this._highLoad += 1;
      if (this._highLoad > 12) {
        this.degraded = true;
        this.beatbox?.beat({ playing: false });
        this.beatbox?.stop();
        this.beatbox = null;
        this.onNotice({ type: 'degrade', text: 'The beatboxer steps back to keep the rail smooth.' });
      }
    } else {
      this._highLoad = Math.max(0, this._highLoad - 1);
    }
  }

  dispose() {
    this._stopToken = (this._stopToken || 0) + 1;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this.started = false;
    this.cantor?.stop();
    this.beatbox?.stop();
    this.cantor = null;
    this.beatbox = null;
    if (this.ctx) {
      try {
        this.ctx.close().catch(() => {});
      } catch {
        /* ignore */
      }
    }
    this.ctx = null;
    this.readyPromise = null;
  }
}

/**
 * A tiny generative synth-score. No audio files: every kick, bell and
 * boss-roar is synthesized live with Web Audio, sequenced on a 16th-note grid.
 *
 * The music is a Rez-like layered groove that opens up as Link awakens.
 * Player shots are quantized into the current scale and become part of the score.
 */
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

const STYLE_INFO = {
  field: {
    bassPattern: [0, null, 0, 7, null, 0, 3, null, 0, null, 5, 7, null, 3, 2, null],
    arpPattern: [0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2],
    arpType: 'triangle',
    arpGain: 0.05,
    arpDur: 0.18,
    arpDelay: 0.34,
    arpOctave: 0,
    padFilter: 1500,
    padType: 'sawtooth',
    padEvery: 2,
    padGain: 0.032,
    padAttack: 0.6,
    padDetunes: [-7, 6],
    leadVoice: 'bell',
    leadGain: 0.046,
    leadDecay: 1.05,
    leadFilter: 5200,
    leadType: 'sine',
    leadType2: 'triangle',
    shimmerSteps: [2, 11, 15],
    shimmerGain: 0.017,
    bassFilter: 450,
    bassType: 'sawtooth',
  },
  woods: {
    bassPattern: [0, null, null, 0, 5, null, 3, null, 0, null, null, 7, 5, null, 3, null],
    arpPattern: [0, null, 2, null, 1, null, 3, null, 4, null, 2, null, 1, null, 3, null],
    arpType: 'sine',
    arpGain: 0.032,
    arpDur: 0.38,
    arpDelay: 0.56,
    arpOctave: -12,
    padFilter: 900,
    padType: 'triangle',
    padEvery: 4,
    padGain: 0.03,
    padAttack: 1.15,
    padDetunes: [-10, 9],
    leadVoice: 'bell',
    leadGain: 0.038,
    leadDecay: 1.7,
    leadFilter: 3200,
    leadType: 'triangle',
    leadType2: 'sine',
    shimmerSteps: [5, 13],
    shimmerGain: 0.015,
    bassFilter: 320,
    bassType: 'sine',
  },
  mountain: {
    bassPattern: [0, 0, null, 3, 0, null, 5, 3, 0, 0, 3, null, 5, 7, 3, null],
    arpPattern: [0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1],
    arpType: 'square',
    arpGain: 0.04,
    arpDur: 0.13,
    arpDelay: 0.22,
    arpOctave: -12,
    padFilter: 620,
    padType: 'sawtooth',
    padEvery: 2,
    padGain: 0.044,
    padAttack: 0.3,
    padDetunes: [-9, 8],
    leadVoice: 'horn',
    leadGain: 0.032,
    leadDecay: 0.7,
    leadFilter: 1050,
    shimmerSteps: [1, 9, 14],
    shimmerGain: 0.012,
    bassFilter: 650,
    bassType: 'sawtooth',
  },
  castle: {
    bassPattern: [0, null, 3, 7, 0, null, 3, 7, 0, null, 5, 3, 7, null, 3, 0],
    arpPattern: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 0, 1],
    arpType: 'square',
    arpGain: 0.038,
    arpDur: 0.16,
    arpDelay: 0.28,
    arpOctave: 0,
    padFilter: 950,
    padType: 'sawtooth',
    padEvery: 2,
    padGain: 0.042,
    padAttack: 0.45,
    padDetunes: [-7, 7],
    leadVoice: 'horn',
    leadGain: 0.038,
    leadDecay: 1.15,
    leadFilter: 1650,
    shimmerSteps: [4, 12],
    shimmerGain: 0.02,
    bassFilter: 430,
    bassType: 'square',
  },
  sacred: {
    bassPattern: [0, null, 7, null, 5, null, 3, null, 0, null, 7, null, 5, 3, null, 2],
    arpPattern: [0, 2, 4, 6, 4, 2, 1, 3, 5, 4, 2, 0, 2, 4, 6, 4],
    arpType: 'triangle',
    arpGain: 0.045,
    arpDur: 0.3,
    arpDelay: 0.52,
    arpOctave: 12,
    padFilter: 2200,
    padType: 'triangle',
    padEvery: 2,
    padGain: 0.032,
    padAttack: 1.35,
    padDetunes: [-4, 6],
    leadVoice: 'bell',
    leadGain: 0.045,
    leadDecay: 1.5,
    leadFilter: 6400,
    leadType: 'sine',
    leadType2: 'sine',
    shimmerSteps: [3, 7, 11, 15],
    shimmerGain: 0.025,
    bassFilter: 420,
    bassType: 'sine',
  },
};

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.reverb = null;
    this.delay = null;
    this.noise = null;
    this.playing = false;
    this.muted = false;
    this.musicVolume = 0.7;
    this.sfxVolume = 0.85;
    this.musicVolumeGain = null;
    this.sfxVolumeGain = null;
    this.boss = false;
    this.awaken = 1;
    this.stage = null;
    this.beatDur = 0.5;
    this.stepDur = 0.125;
    this.nextStepTime = 0;
    this.step = 0;
    this.musicStart = 0;
    this.timer = null;
    this.drone = null;
    this.playerNoteIndex = 3;
    this.layers = { kick: 1, bass: 1, hats: 1, arp: 0, pad: 0, lead: 0, shimmer: 0 };
    this.layerGains = {};
    this._lastHarmony = 0;
    this.volleyVoices = new Set();
    this.bossPhase = 1;
    this._lastForm = -1;
    this.musicSeed = (Math.random() * 0xffffffff) >>> 0;
  }

  get available() {
    return !!this.ctx;
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  async unlock() {
    if (!this.ctx) this._init();
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignored */
      }
    }
  }

  _init() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.72;
    this.master = master;
    master.connect(comp);
    comp.connect(ctx.destination);

    const musicVolume = ctx.createGain();
    musicVolume.gain.value = this.musicVolume;
    musicVolume.connect(master);
    this.musicVolumeGain = musicVolume;

    const sfxVolume = ctx.createGain();
    sfxVolume.gain.value = this.sfxVolume;
    sfxVolume.connect(master);
    this.sfxVolumeGain = sfxVolume;

    const musicBus = ctx.createGain();
    musicBus.gain.value = 0.9;
    musicBus.connect(musicVolume);
    this.musicBus = musicBus;

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(sfxVolume);
    this.sfxBus = sfxBus;

    // A glassy plate-ish reverb from synthesized noise.
    const conv = ctx.createConvolver();
    conv.buffer = this._makeImpulse(2.6, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    conv.connect(wet);
    wet.connect(musicBus);
    this.reverb = conv;

    // Ping-pong-ish feedback delay for bells and arps.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dampFilter = ctx.createBiquadFilter();
    dampFilter.type = 'lowpass';
    dampFilter.frequency.value = 3200;
    const wetDelay = ctx.createGain();
    wetDelay.gain.value = 0.4;
    delay.connect(dampFilter);
    dampFilter.connect(fb);
    fb.connect(delay);
    dampFilter.connect(wetDelay);
    wetDelay.connect(musicBus);
    this.delay = delay;

    // Layer buses.
    for (const name of Object.keys(this.layers)) {
      const g = ctx.createGain();
      g.gain.value = 0;
      if (name === 'lead' || name === 'arp') {
        if (!this.melodicBus) {
          this.melodicBus = ctx.createGain();
          this.melodicBus.connect(musicBus);
        }
        g.connect(this.melodicBus);
      } else g.connect(musicBus);
      this.layerGains[name] = g;
    }
    // Kick and bass are always audible once the stage starts.
    this.layerGains.kick.gain.value = 1;
    this.layerGains.bass.gain.value = 1;
    this.layerGains.hats.gain.value = 0.75;

    this.noise = this._makeNoise(2);
    this.timer = setInterval(() => this._schedule(), 25);
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buf;
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
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - Math.exp(-i / 200));
      }
    }
    return buf;
  }

  setVolumes(music, sfx) {
    if (Number.isFinite(music)) this.musicVolume = Math.max(0, Math.min(1, music));
    if (Number.isFinite(sfx)) this.sfxVolume = Math.max(0, Math.min(1, sfx));
    if (this.ctx) {
      const t = this.ctx.currentTime;
      if (this.musicVolumeGain) this.musicVolumeGain.gain.setTargetAtTime(this.musicVolume, t, 0.05);
      if (this.sfxVolumeGain) this.sfxVolumeGain.gain.setTargetAtTime(this.sfxVolume, t, 0.05);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.05);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _layersForAwaken(level) {
    if (this.boss) return { kick: 1, bass: 1.1, hats: 1, arp: 1, pad: 1, lead: 1, shimmer: 1 };
    return {
      kick: 1,
      bass: 1,
      hats: level >= 1 ? 0.8 : 0.55,
      arp: level >= 2 ? 0.82 : 0,
      pad: level >= 3 ? 0.72 : 0,
      lead: level >= 5 ? 0.78 : 0,
      shimmer: level >= 7 ? 0.8 : 0,
    };
  }

  _applyLayers(time = this.ctx?.currentTime ?? 0) {
    if (!this.ctx) return;
    const target = this._layersForAwaken(this.awaken);
    for (const [name, gain] of Object.entries(this.layerGains)) {
      const v = target[name] ?? 0;
      gain.gain.cancelScheduledValues(time);
      gain.gain.setTargetAtTime(v, time, 0.55);
    }
  }

  setAwaken(level) {
    this.awaken = clamp(level, 1, 10);
    if (this.ctx) this._applyLayers();
  }

  startStage(stage) {
    if (!this.ctx) return;
    this.clearVolley();
    this.stopDrone(0.3);
    this.stage = stage;
    this.playing = true;
    this.boss = false;
    this.beatDur = 60 / stage.bpm;
    this.stepDur = this.beatDur / 4;
    this.delay?.delayTime.setTargetAtTime(this.beatDur * 0.75, this.ctx.currentTime, 0.08);
    this.step = 0;
    this.musicStart = this.ctx.currentTime + 0.14;
    this.nextStepTime = this.musicStart;
    this.playerNoteIndex = Math.floor(stage.mode ? 2 : 0);
    this.bossPhase = 1;
    this._lastForm = -1;
    this.musicSeed = (Math.random() * 0xffffffff) >>> 0;
    this.awaken = 1;
    this._applyLayers();

    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.2);
    }
  }

  /** Restart the sequencer on a distinct boss theme. */
  startBossTheme(config) {
    if (!this.ctx || !config) return;
    this.clearVolley();
    this.stopDrone(0.2);
    this.stage = config;
    this.playing = true;
    this.boss = true;
    this.beatDur = 60 / config.bpm;
    this.stepDur = this.beatDur / 4;
    this.delay?.delayTime.setTargetAtTime(this.beatDur * 0.75, this.ctx.currentTime, 0.08);
    this.step = 0;
    this.musicStart = this.ctx.currentTime + 0.12;
    this.nextStepTime = this.musicStart;
    this.playerNoteIndex = 2;
    this.bossPhase = 1;
    this._lastForm = -1;
    this.musicSeed = (Math.random() * 0xffffffff) >>> 0;
    this._applyLayers();
    if (this.musicBus) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), t);
      this.musicBus.gain.setTargetAtTime(0.9, t, 0.25);
    }
    this.startDrone();
  }

  setBoss(isBoss) {
    if (!this.ctx) return;
    this.boss = isBoss;
    if (isBoss) {
      this._applyLayers();
      this.startDrone();
    }
  }

  setBossPhase(phase) {
    this.bossPhase = clamp(Number(phase) || 1, 1, 3);
    if (this.ctx && this.boss) this._applyLayers();
  }

  startDrone() {
    if (!this.ctx || this.drone || !this.stage) return;
    const t = this.ctx.currentTime;
    const root = midiHz(this.stage.root - 12);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.035, t, 1.2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sine';
    osc1.frequency.value = root * 0.5;
    osc2.frequency.value = root * 0.5 + 0.7;
    osc1.detune.value = -7;
    osc2.detune.value = 5;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.musicBus);
    osc1.start(t);
    osc2.start(t);
    this.drone = { g, osc1, osc2 };
  }

  stopDrone(fade = 1.2) {
    if (!this.drone || !this.ctx) return;
    const { g, osc1, osc2 } = this.drone;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, fade / 3);
    try {
      osc1.stop(t + fade);
      osc2.stop(t + fade);
    } catch {
      /* noop */
    }
    this.drone = null;
  }

  stopMusic(fade = 1.2) {
    this.playing = false;
    this.clearVolley();
    this.stopDrone(fade);
    if (this.ctx && this.musicBus) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setTargetAtTime(0.0001, t, fade / 3);
    }
  }

  pause() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /* ---------------------------------------------------------------- */
  /* beat clock                                                        */
  /* ---------------------------------------------------------------- */

  getBeatInfo() {
    if (!this.ctx) return { beat: 0, bar: 0, step: 0, phase: 0, playing: false };
    const elapsed = Math.max(0, (this.ctx.currentTime - this.musicStart) / this.beatDur);
    return {
      beat: elapsed,
      bar: Math.floor(elapsed / 4),
      step: Math.floor(elapsed * 4),
      phase: elapsed % 1,
      playing: this.playing,
    };
  }

  /** Seconds from the nearest quarter-note beat. */
  beatError() {
    if (!this.ctx) return 99;
    const elapsed = (this.ctx.currentTime - this.musicStart) / this.beatDur;
    const frac = elapsed - Math.round(elapsed);
    return Math.abs(frac) * this.beatDur;
  }

  isOnBeat(tolerance = 0.1) {
    return this.beatError() < tolerance;
  }

  _currentChord(time = this.ctx?.currentTime ?? 0) {
    if (!this.stage) return [0, 3, 7];
    const bar = Math.max(0, Math.floor((time - this.musicStart) / (this.beatDur * 4)));
    const blockBars = this.boss ? 4 : 8;
    const useB = !!this.stage.progressionB && Math.floor(bar / blockBars) % 2 === 1;
    const prog = useB ? this.stage.progressionB : this.stage.progression;
    const [offset, quality] = prog[bar % prog.length];
    return QUALITIES[quality].map((iv) => this.stage.root + offset + iv);
  }

  /* ---------------------------------------------------------------- */
  /* sequencing                                                        */
  /* ---------------------------------------------------------------- */

  _schedule() {
    if (!this.ctx || !this.playing || !this.stage) return;
    const lookahead = 0.16;
    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      this._scheduleStep(this.step, this.nextStepTime);
      this.step++;
      this.nextStepTime += this.stepDur;
    }
  }

  _scheduleStep(step, time) {
    const stage = this.stage;
    const styleName = STYLE_INFO[stage.style] ? stage.style : 'field';
    const style = STYLE_INFO[styleName];
    const barStep = step % 16;
    const bar = Math.floor(step / 16);
    const blockBars = this.boss ? 4 : 8;
    const form = Math.floor(bar / blockBars) % 4;
    const useB = !!stage.progressionB && Math.floor(bar / blockBars) % 2 === 1;
    const prog = useB ? stage.progressionB : stage.progression;
    const [offset, quality] = prog[bar % prog.length];
    const chord = QUALITIES[quality].map((iv) => stage.root + offset + iv);
    const scale = SCALES[stage.mode] || SCALES.aeolian;
    const g = this.layerGains;
    const breakdown = form === 2;
    const climax = form === 3;
    const salt = (bar * 37 + barStep * 11 + this.musicSeed) >>> 0;

    // A small accent at the turn of each phrase.
    if (barStep === 0 && form !== this._lastForm) {
      this._lastForm = form;
      this._anvil(time, this.boss ? 0.2 : 0.16);
    }

    this._playDrums(styleName, form, barStep, bar, time);
    // A quiet, dry quarter-note anchor remains legible through breakdowns.
    if (breakdown && barStep % 4 === 0) this._kick(time, 0.16);

    // --- bass ---
    if (g.bass.gain.value > 0.001) {
      let degree = style.bassPattern[barStep];
      if (breakdown && barStep !== 0 && barStep !== 8) degree = null;
      if (this.boss && this.bossPhase === 3 && barStep === 6) degree = 7;
      if (degree !== null && degree !== undefined) {
        let note = chord[0] - 12 + degree;
        if (this.boss && this.bossPhase >= 2 && barStep === 8) note -= 12;
        this._bass(time, note, this.boss ? 0.16 : 0.2, {
          filter: style.bassFilter + (climax ? 120 : 0),
          type: style.bassType,
        });
      }
    }

    // --- arpeggio ---
    if (g.arp.gain.value > 0.001) {
      let idx = style.arpPattern[barStep];
      if (breakdown && barStep % 8 !== 0) idx = null;
      if (idx !== null && idx !== undefined) {
        const octave =
          style.arpOctave + (barStep >= 8 ? 12 : 0) + (climax ? 12 : 0) + (this.boss && this.bossPhase >= 2 ? 12 : 0);
        const note = chord[idx % chord.length] + 12 + octave;
        this._pluck(time, note, style.arpGain * (climax ? 1.12 : 1), style.arpDur, style.arpType, style.arpDelay);
        if (climax && barStep % 8 === 6) {
          this._pluck(time, note + 12, style.arpGain * 0.42, style.arpDur * 0.8, 'sine', style.arpDelay);
        }
        if (!breakdown && salt % 23 === 0) {
          this._pluck(time, note + 12, style.arpGain * 0.28, style.arpDur * 0.65, 'sine', style.arpDelay);
        }
      }
    }

    // --- pads ---
    if (g.pad.gain.value > 0.001 && bar % style.padEvery === 0 && barStep === 0) {
      let padNotes;
      if (styleName === 'mountain') padNotes = [chord[0] - 12, chord[2]];
      else if (styleName === 'sacred') padNotes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 19];
      else if (styleName === 'castle') padNotes = [chord[0], chord[2], chord[0] + 12];
      else padNotes = chord.slice(0, 3).map((n) => n + 12);
      this._pad(time, padNotes, this.beatDur * 4 * style.padEvery, style.padGain * (breakdown ? 1.2 : 1), {
        filter: style.padFilter + (climax ? 180 : 0),
        type: style.padType,
        attack: style.padAttack,
        detunes: style.padDetunes,
      });
    }

    // --- lead motif ---
    if (g.lead.gain.value > 0.001) {
      let motif = stage.motif;
      if (form === 1 || form === 2) motif = stage.motifB || stage.motif;
      const shift = form === 1 ? 2 : form === 2 ? -1 : 0;
      let degree = motif[(barStep + shift + 16) % 16];
      // Leave space in the main phrase; the full melody arrives in the variation.
      if (!this.boss && form === 0 && bar % 2 === 1) degree = null;
      if (breakdown && ![0, 4, 8, 12].includes(barStep)) degree = null;
      if (degree !== null && degree !== undefined) {
        const sc = scale;
        const octave = Math.floor(degree / sc.length);
        let note = stage.root + 24 + sc[degree % sc.length] + octave * 12;
        if (form === 2) note -= 12;
        if (form === 3) note += 12;
        if (this.boss && this.bossPhase >= 3) note += 12;
        if (style.leadVoice === 'horn') {
          this._horn(time, note, style.leadGain * (breakdown ? 0.75 : 1), this.boss ? 0.62 : 0.82, style.leadFilter);
        } else {
          this._bell(time, note, style.leadGain * (breakdown ? 0.8 : 1), style.leadDecay, {
            type: style.leadType,
            type2: style.leadType2,
            filter: style.leadFilter,
          });
        }
        if (climax && barStep % 8 === 4) {
          this._bell(time, note + 12, style.leadGain * 0.32, style.leadDecay * 0.7, {
            type: 'sine',
            type2: 'triangle',
            filter: style.leadFilter + 1400,
          });
        }
        if (!this.boss && salt % 31 === 0) {
          this._bell(time, note - 12, style.leadGain * 0.22, style.leadDecay * 0.65, {
            type: 'sine',
            type2: 'sine',
            filter: style.leadFilter,
          });
        }
      }
      if (this.boss && this.bossPhase >= 2 && barStep === 12) {
        const harmony = stage.root + 24 + scale[(bar + 3) % scale.length] + 12;
        this._bell(time, harmony, style.leadGain * 0.4, 0.8, {
          type: 'triangle',
          type2: 'sine',
          filter: 5000,
        });
      }
    }

    // --- shimmer ---
    if (g.shimmer.gain.value > 0.001 && style.shimmerSteps.includes(barStep) && !breakdown) {
      const note =
        stage.root + 36 + scale[(bar + barStep) % scale.length] + (climax ? 12 : 0) + (this.bossPhase >= 3 ? 12 : 0);
      this._bell(time, note, style.shimmerGain * (this.boss ? 1.1 : 1), 0.62, {
        type: 'sine',
        type2: 'sine',
        filter: 7200,
      });
    }

    // --- section turns and boss accents ---
    if (!this.boss && climax && barStep === 0) {
      this._pluck(time, chord[1] + 24, 0.026, 0.9, 'triangle', 0.5);
    }
    if (this.boss && barStep === 0 && bar % (this.bossPhase >= 3 ? 2 : 4) === 0) {
      this._pluck(time, chord[0] + 12, 0.03, 1.2, 'sawtooth', 0.2);
    }
  }

  _playDrums(styleName, form, barStep, bar, time) {
    const boss = this.boss;
    const phase = this.bossPhase || 1;
    const heavy = boss ? 1.12 : 1;
    const calm = form === 2 && !boss;
    const fillBar = bar % (boss ? 2 : 4) === (boss ? 1 : 3);
    switch (styleName) {
      case 'woods': {
        if (barStep === 0 || barStep === 8) this._kick(time, (calm ? 0.55 : 0.78) * heavy);
        if (!calm && barStep === 3) this._tom(time, 0.2);
        if (barStep === 4 || barStep === 12) this._rim(time, (calm ? 0.22 : 0.45) * heavy);
        if (!calm && (barStep === 6 || barStep === 14)) this._shaker(time, 0.2);
        if (!calm && barStep === 10) this._hat(time, 0.15);
        if (!calm && barStep === 15 && bar % 2 === 0) this._rim(time, 0.22);
        if (fillBar && barStep >= 13) this._tom(time + (barStep - 13) * this.stepDur, 0.25);
        if (boss) {
          if (barStep === 4 || barStep === 12) this._kick(time, 0.42);
          if (phase >= 2 && (barStep === 7 || barStep === 15)) this._tom(time, 0.32);
        }
        break;
      }
      case 'mountain': {
        const hits = [0, 3, 6, 8, 11, 14];
        if (!calm && hits.includes(barStep)) {
          this._kick(time, (barStep === 0 || barStep === 8 ? 1 : 0.54) * heavy);
        } else if (calm && (barStep === 0 || barStep === 8)) {
          this._kick(time, 0.6);
        }
        if (barStep === 4 || barStep === 12) this._snare(time, (calm ? 0.5 : 0.88) * heavy);
        if (!calm && (barStep === 2 || barStep === 10)) this._tom(time, 0.42);
        if (!calm && (barStep === 5 || barStep === 13)) this._anvil(time, 0.28);
        if (!calm && barStep % 2 === 1) this._hat(time, 0.22);
        if (fillBar && barStep >= 12) {
          this._tom(time, 0.46);
          this._tom(time + this.stepDur * 0.5, 0.32);
        }
        if (boss) {
          if (barStep === 7 || barStep === 15) this._tom(time, 0.46);
          if (phase >= 2 && (barStep === 1 || barStep === 9)) this._anvil(time, 0.18);
        }
        break;
      }
      case 'castle': {
        if (barStep === 0 || barStep === 8) this._kick(time, 0.76 * heavy);
        if (barStep === 4 || barStep === 12) this._snare(time, (calm ? 0.5 : 0.84) * heavy);
        if (!calm && (barStep === 3 || barStep === 11)) this._snare(time, 0.2);
        if (!calm && [2, 6, 10, 14].includes(barStep)) this._hat(time, 0.3);
        if (!calm && barStep === 15) this._tom(time, 0.28);
        if (barStep === 0 && bar % 4 === 0) this._anvil(time, 0.16);
        if (fillBar && barStep >= 13) this._snare(time, 0.28);
        if (boss) {
          if (barStep === 2 || barStep === 10) this._rim(time, 0.24);
          if (phase >= 2 && (barStep === 7 || barStep === 15)) this._snare(time, 0.34);
          if (phase >= 3 && barStep === 0) this._anvil(time, 0.22);
        }
        break;
      }
      case 'sacred': {
        if (barStep === 0 || barStep === 8) this._kick(time, (calm ? 0.4 : 0.58) * heavy);
        if (!calm && (barStep === 4 || barStep === 12)) this._clap(time, 0.24);
        if (!calm && (barStep === 2 || barStep === 10 || barStep === 6 || barStep === 14)) this._shaker(time, 0.15);
        if (!calm && barStep === 15) this._hat(time, 0.18);
        if (fillBar && barStep >= 14) this._tom(time, 0.18);
        if (boss) {
          if (barStep === 4 || barStep === 12) this._kick(time, 0.36);
          if (phase >= 2 && barStep === 7) this._tom(time, 0.26);
          if (phase >= 3 && barStep % 4 === 2) this._clap(time, 0.14);
        }
        break;
      }
      default: {
        if (calm) {
          if (barStep === 0 || barStep === 8) this._kick(time, 0.6);
          if (barStep === 8) this._snare(time, 0.35);
          if (barStep === 4 || barStep === 12) this._rim(time, 0.2);
        } else {
          if (barStep % 4 === 0) this._kick(time, 0.92 * heavy);
          if (barStep === 4 || barStep === 12) this._snare(time, 0.8 * heavy);
          if (barStep % 2 === 1) this._hat(time, barStep % 4 === 3 ? 0.62 : 0.36);
          if (form >= 1 && barStep === 10) this._kick(time, 0.26);
          if (form === 3 && barStep === 14) this._hat(time, 0.26);
          if (fillBar && barStep >= 12) this._tom(time, 0.32);
        }
        if (boss) {
          if (barStep === 0 || barStep === 8) this._kick(time, 0.4);
          if (barStep === 7 || barStep === 15) this._tom(time, 0.32);
          if (phase >= 2 && barStep === 1) this._anvil(time, 0.14);
        }
        break;
      }
    }
    if (boss) {
      if (phase >= 2 && barStep === 15) this._tom(time, 0.3);
      if (phase >= 3 && barStep === 0) this._kick(time, 0.5);
      if (phase >= 3 && (barStep === 5 || barStep === 11)) this._hat(time, 0.28);
    }
  }

  /* ---------------------------------------------------------------- */
  /* instruments                                                       */
  /* ---------------------------------------------------------------- */

  _kick(time, vel = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.62 * vel, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.36);
    osc.connect(gain);
    gain.connect(this.layerGains.kick);
    osc.start(time);
    osc.stop(time + 0.4);

    // transient click
    const click = ctx.createBufferSource();
    click.buffer = this.noise;
    const cg = ctx.createGain();
    const cf = ctx.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 1200;
    cg.gain.setValueAtTime(0.12 * vel, time);
    cg.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    click.connect(cf);
    cf.connect(cg);
    cg.connect(this.layerGains.kick);
    click.start(time, Math.random() * 1.5, 0.04);
  }

  _snare(time, vel = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.16 * vel, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.layerGains.hats);
    if (this.reverb) {
      const send = ctx.createGain();
      send.gain.value = 0.12;
      g.connect(send);
      send.connect(this.reverb);
    }
    src.start(time, Math.random() * 1.2, 0.22);

    const tone = ctx.createOscillator();
    const tg = ctx.createGain();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(185, time);
    tone.frequency.exponentialRampToValueAtTime(120, time + 0.1);
    tg.gain.setValueAtTime(0.1 * vel, time);
    tg.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
    tone.connect(tg);
    tg.connect(this.layerGains.hats);
    tone.start(time);
    tone.stop(time + 0.13);
  }

  _hat(time, vel = 0.5) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.028 * vel, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.layerGains.hats);
    src.start(time, Math.random(), 0.06);
  }

  _shaker(time, vel = 0.3) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4600;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.02 * vel, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.layerGains.hats);
    src.start(time, Math.random(), 0.1);
  }

  _rim(time, vel = 0.4) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.09 * vel, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.layerGains.hats);
    src.start(time, Math.random() * 1.2, 0.07);
    const tone = ctx.createOscillator();
    const tg = ctx.createGain();
    tone.type = 'triangle';
    tone.frequency.value = 420;
    tg.gain.setValueAtTime(0.03 * vel, time);
    tg.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    tone.connect(tg);
    tg.connect(this.layerGains.hats);
    tone.start(time);
    tone.stop(time + 0.06);
  }

  _clap(time, vel = 0.3) {
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1450 + i * 500;
      bp.Q.value = 1.3;
      const g = ctx.createGain();
      const at = time + i * 0.015;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.08 * vel, at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.layerGains.hats);
      src.start(at, Math.random() * 1.1, 0.18);
    }
  }

  _anvil(time, vel = 0.2) {
    const ctx = this.ctx;
    [660, 990.5, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime((0.022 - i * 0.005) * vel * 4, time + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.28 + i * 0.06);
      osc.connect(g);
      g.connect(this.layerGains.hats);
      osc.start(time);
      osc.stop(time + 0.4);
    });
  }

  _horn(time, note, gain = 0.035, dur = 0.8, filterFreq = 1200) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'triangle';
    osc.frequency.value = midiHz(note);
    osc2.frequency.value = midiHz(note) * 0.998;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(180, filterFreq * 0.55), time + dur);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.08);
    g.gain.setTargetAtTime(0.0001, time + dur * 0.55, dur * 0.25);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.layerGains.lead);
    if (this.reverb) {
      const send = ctx.createGain();
      send.gain.value = 0.4;
      g.connect(send);
      send.connect(this.reverb);
    }
    osc.start(time);
    osc2.start(time);
    osc.stop(time + dur + 0.3);
    osc2.stop(time + dur + 0.3);
  }

  _tom(time, vel = 0.5) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, time);
    osc.frequency.exponentialRampToValueAtTime(65, time + 0.18);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.1 * vel, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    osc.connect(g);
    g.connect(this.layerGains.hats);
    if (this.reverb) {
      const send = ctx.createGain();
      send.gain.value = 0.18;
      g.connect(send);
      send.connect(this.reverb);
    }
    osc.start(time);
    osc.stop(time + 0.25);
  }

  _bass(time, note, dur, opts = {}) {
    const ctx = this.ctx;
    const { type = 'sawtooth', filter: filterFreq = this.boss ? 620 : 440 } = opts;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = midiHz(note);
    filter.type = 'lowpass';
    filter.Q.value = 5;
    filter.frequency.setValueAtTime(filterFreq, time);
    filter.frequency.exponentialRampToValueAtTime(120, time + dur * 0.9);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.11, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.layerGains.bass);
    osc.start(time);
    osc.stop(time + dur + 0.02);

    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = midiHz(note);
    sg.gain.setValueAtTime(0.0001, time);
    sg.gain.exponentialRampToValueAtTime(0.035, time + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    sub.connect(sg);
    sg.connect(this.layerGains.bass);
    sub.start(time);
    sub.stop(time + dur + 0.02);
  }

  _pluck(time, note, gain = 0.06, dur = 0.25, type = 'triangle', delaySend = 0.25) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = midiHz(note);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4200, time);
    filter.frequency.exponentialRampToValueAtTime(900, time + dur);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.layerGains.arp);
    if (delaySend > 0 && this.delay) {
      const send = ctx.createGain();
      send.gain.value = delaySend;
      g.connect(send);
      send.connect(this.delay);
    }
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  _bell(time, note, gain = 0.05, decay = 1, opts = {}) {
    const ctx = this.ctx;
    const { type = 'sine', type2 = 'triangle', filter: filterFreq = 5200 } = opts;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = type;
    osc2.type = type2;
    osc.frequency.value = midiHz(note);
    osc2.frequency.value = midiHz(note) * 2.01;
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 1.6 * decay);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.layerGains.lead);
    if (this.reverb) {
      const send = ctx.createGain();
      send.gain.value = 0.22;
      g.connect(send);
      send.connect(this.reverb);
    }
    osc.start(time);
    osc2.start(time);
    osc.stop(time + 1.7 * decay);
    osc2.stop(time + 1.7 * decay);
  }

  _pad(time, notes, dur, gain, opts = {}) {
    const ctx = this.ctx;
    const { filter: filterFreq = this.boss ? 900 : 1300, type = 'sawtooth', attack = 0.7, detunes = [-7, 6] } = opts;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + attack);
    g.gain.setTargetAtTime(0.0001, time + dur - 0.8, 0.5);
    filter.connect(g);
    g.connect(this.layerGains.pad);
    if (this.reverb) {
      const send = ctx.createGain();
      send.gain.value = 0.7;
      g.connect(send);
      send.connect(this.reverb);
    }
    for (const note of notes) {
      for (const det of detunes) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = midiHz(note);
        osc.detune.value = det;
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + dur + 0.5);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* player interactions & sfx                                        */
  /* ---------------------------------------------------------------- */

  lockBlip(count = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(760 * Math.pow(1.09, count), t);
    osc.frequency.exponentialRampToValueAtTime(1180 * Math.pow(1.09, count), t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** A player shot, pitched into the current chord. Becomes part of the music. */
  clearVolley() {
    for (const osc of this.volleyVoices) { try { osc.stop(); } catch { /* already ended */ } }
    this.volleyVoices.clear();
    if (this.melodicBus && this.ctx) {
      this.melodicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.melodicBus.gain.setValueAtTime(1, this.ctx.currentTime);
    }
  }

  playVolley(count, onBeat = false, chain = 0) {
    if (!this.ctx || !this.playing || count <= 0) return;
    this.clearVolley();
    const now = this.ctx.currentTime;
    const start = this.musicStart + Math.ceil((now + 0.008 - this.musicStart) / this.stepDur) * this.stepDur;
    const spacing = this.stepDur;
    const end = start + (count - 1) * spacing + 0.18;
    const gain = this.melodicBus.gain;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(0.42, now, 0.025);
    gain.setTargetAtTime(1, end, 0.15);
    for (let i = 0; i < count; i++) this.playerNote(onBeat, chain, start + i * spacing);
  }

  playerNote(onBeat = false, chain = 0, t = this.ctx?.currentTime) {
    if (!this.ctx) return;
    const chord = this._currentChord(t);
    const degs = [0, 1, 2, 1, 2, 0, 2, 1];
    const d = degs[this.playerNoteIndex % degs.length];
    this.playerNoteIndex++;
    const chainLift = chain >= 7 ? 24 : chain >= 3 ? 12 : 0;
    const note = chord[d % chord.length] + 24 + chainLift + (this.playerNoteIndex % 4 === 0 ? 12 : 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.value = midiHz(note);
    filter.type = 'lowpass';
    filter.frequency.value = 6000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(onBeat ? 0.052 : 0.032, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (onBeat ? 0.55 : 0.3));
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.musicBus);
    if (this.delay) {
      const send = this.ctx.createGain();
      send.gain.value = 0.22;
      g.connect(send);
      send.connect(this.delay);
    }
    if (onBeat && this.reverb) {
      const send = this.ctx.createGain();
      send.gain.value = 0.18;
      g.connect(send);
      send.connect(this.reverb);
    }
    osc.start(t);
    osc.stop(t + 0.6);
    this.volleyVoices.add(osc);
    osc.onended = () => { this.volleyVoices.delete(osc); osc.disconnect(); filter.disconnect(); g.disconnect(); };
  }

  fireWhoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + 0.18);
    bp.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(t, Math.random(), 0.3);
  }

  explode(size = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const big = size >= 2;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(big ? 2400 : 3600, t);
    lp.frequency.exponentialRampToValueAtTime(big ? 180 : 500, t + (big ? 1.4 : 0.42));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(big ? 0.3 : 0.13 * size, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 1.5 : 0.5));
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    if (this.reverb) {
      const send = this.ctx.createGain();
      send.gain.value = big ? 0.5 : 0.15;
      g.connect(send);
      send.connect(this.reverb);
    }
    src.start(t, Math.random() * 1.2, big ? 1.6 : 0.6);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(big ? 90 : 150, t);
    osc.frequency.exponentialRampToValueAtTime(big ? 26 : 55, t + (big ? 1.1 : 0.3));
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(big ? 0.32 : 0.12, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 1.3 : 0.36));
    osc.connect(og);
    og.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + (big ? 1.4 : 0.4));
  }

  hitMarker() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.05);
    g.gain.setValueAtTime(0.025, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  wardClang() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  damage() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.5);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 640;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.6);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.06, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(this.sfxBus);
    src.start(t, Math.random(), 0.35);
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 0.07, 0.14].forEach((dt, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = midiHz([76, 81, 88][i]);
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.05, t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.25);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.start(t + dt);
      osc.stop(t + dt + 0.28);
    });
  }

  awakenChord() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const chord = this._currentChord();
    [...chord, chord[0] + 12, chord[1] + 12].forEach((note, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = midiHz(note + 12);
      g.gain.setValueAtTime(0.0001, t + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.035, t + i * 0.055 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.055 + 0.9);
      osc.connect(g);
      g.connect(this.sfxBus);
      if (this.reverb) g.connect(this.reverb);
      osc.start(t + i * 0.055);
      osc.stop(t + i * 0.055 + 1);
    });
  }

  bossRoar() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(88, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 1.3);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 1.4);
    lp.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    if (this.reverb) g.connect(this.reverb);
    osc.start(t);
    osc.stop(t + 1.7);

    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 11;
    lg.gain.value = 18;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + 1.6);
  }

  fanfare() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [60, 64, 67, 72, 67, 72, 76];
    notes.forEach((note, i) => {
      const when = t + i * 0.12;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = midiHz(note);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.05, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.9);
      osc.connect(g);
      g.connect(this.sfxBus);
      if (this.reverb) g.connect(this.reverb);
      osc.start(when);
      osc.stop(when + 1);
    });
  }

  defeat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [55, 51, 48, 43];
    notes.forEach((note, i) => {
      const when = t + i * 0.35;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = midiHz(note);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.06, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 1.4);
      osc.connect(g);
      g.connect(this.sfxBus);
      if (this.reverb) g.connect(this.reverb);
      osc.start(when);
      osc.stop(when + 1.5);
    });
  }

  uiHover() {
    this._uiTone(740, 0.04);
  }

  uiConfirm() {
    this._uiTone(520, 0.2, true);
  }

  _uiTone(freq, dur, second = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (second) osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.02, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

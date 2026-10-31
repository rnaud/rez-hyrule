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
  }

  get available() {
    return !!this.ctx;
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

    const musicBus = ctx.createGain();
    musicBus.gain.value = 0.9;
    musicBus.connect(master);
    this.musicBus = musicBus;

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);
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
      g.connect(musicBus);
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
      arp: level >= 3 ? 0.9 : 0,
      pad: level >= 5 ? 0.8 : 0,
      lead: level >= 7 ? 0.85 : 0,
      shimmer: level >= 9 ? 0.9 : 0,
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
    this.stopDrone(0.3);
    this.stage = stage;
    this.playing = true;
    this.boss = false;
    this.beatDur = 60 / stage.bpm;
    this.stepDur = this.beatDur / 4;
    this.step = 0;
    this.musicStart = this.ctx.currentTime + 0.14;
    this.nextStepTime = this.musicStart;
    this.playerNoteIndex = Math.floor(stage.mode ? 2 : 0);
    this.awaken = 1;
    this._applyLayers();

    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.2);
    }
  }

  setBoss(isBoss) {
    if (!this.ctx) return;
    this.boss = isBoss;
    if (isBoss) {
      this._applyLayers();
      this.startDrone();
    }
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

  _currentChord() {
    if (!this.stage) return [0, 3, 7];
    const info = this.getBeatInfo();
    const bar = Math.max(0, Math.floor(info.beat / 4));
    const prog = this.stage.progression;
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
    const barStep = step % 16;
    const bar = Math.floor(step / 16);
    const prog = stage.progression;
    const [offset, quality] = prog[bar % prog.length];
    const chord = QUALITIES[quality].map((iv) => stage.root + offset + iv);
    const scale = SCALES[stage.mode] || SCALES.aeolian;

    const g = this.layerGains;

    // --- drums ---
    if (this.boss) {
      if (barStep % 4 === 0) this._kick(time, 1.05);
      if (barStep === 4 || barStep === 12) this._snare(time, 1);
      const boss16 = barStep % 2 === 0;
      if (boss16) this._hat(time, barStep % 4 === 2 ? 0.8 : 0.45);
      if (barStep === 7 || barStep === 15) this._tom(time, 0.6);
      if (barStep === 10) this._tom(time, 0.35);
    } else {
      if (barStep % 4 === 0) this._kick(time, 0.95);
      if (barStep % 4 === 2 && this.awaken >= 3) this._kick(time, 0.35);
      if (barStep === 4 || barStep === 12) this._snare(time, 0.85);
      if (barStep % 2 === 1) this._hat(time, barStep % 4 === 3 ? 0.7 : 0.4);
      if (this.awaken >= 6 && (barStep === 14 || barStep === 6)) this._hat(time, 0.25, true);
    }

    // --- bass ---
    if (g.bass.gain.value > 0.001) {
      const bassPattern = [0, null, 0, 7, null, 0, 3, null, 0, null, 0, 7, null, 5, 3, null];
      const note = bassPattern[barStep];
      if (note !== null && note !== undefined) {
        this._bass(time, chord[0] - 12 + note, this.boss ? 0.16 : 0.2);
      }
    }

    // --- hats layer adds off-grid ticks ---
    if (g.hats.gain.value > 0.001 && this.awaken >= 2 && !this.boss) {
      if (barStep % 4 === 1) this._shaker(time, 0.28);
    }

    // --- arpeggio ---
    if (g.arp.gain.value > 0.001) {
      const arpSeq = [0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2];
      const idx = arpSeq[barStep];
      const octave = barStep % 8 >= 4 ? 12 : 0;
      const note = chord[idx % chord.length] + 12 + octave + (this.boss ? 12 : 0);
      this._pluck(time, note, 0.055, 0.18, 'triangle', 0.35);
      if (this.boss && barStep % 4 === 0) this._pluck(time, note + 12, 0.03, 0.12, 'sine', 0.5);
    }

    // --- pads, every other bar ---
    if (g.pad.gain.value > 0.001 && bar % 2 === 0 && barStep === 0) {
      const dur = this.beatDur * 8;
      this._pad(time, chord.map((n) => n + 12), dur, this.boss ? 0.04 : 0.03);
    }

    // --- lead motif ---
    if (g.lead.gain.value > 0.001) {
      const motif = stage.motif || [0, null, 2, null, 4, null, 3, null, 2, null, 4, null, 1, null, 2, null];
      const deg = motif[barStep];
      if (deg !== null && deg !== undefined) {
        const sc = scale;
        const oct = Math.floor(deg / sc.length);
        const note = stage.root + 24 + sc[deg % sc.length] + oct * 12;
        this._bell(time, note, this.boss ? 0.05 : 0.045, 0.9);
      }
    }

    // --- shimmer layer: high fairy sparkle ---
    if (g.shimmer.gain.value > 0.001 && (barStep === 2 || barStep === 11 || barStep === 15)) {
      const note = stage.root + 36 + scale[(bar + barStep) % scale.length];
      this._bell(time, note, 0.018, 0.5);
    }

    // occasional chord stab on boss phase transitions
    if (this.boss && barStep === 0 && bar % 4 === 0) {
      this._pluck(time, chord[0] + 12, 0.03, 1.2, 'sawtooth', 0.2);
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

  _bass(time, note, dur) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = midiHz(note);
    filter.type = 'lowpass';
    filter.Q.value = 5;
    filter.frequency.setValueAtTime(this.boss ? 620 : 440, time);
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

  _bell(time, note, gain = 0.05, decay = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value = midiHz(note);
    osc2.frequency.value = midiHz(note) * 2.01;
    filter.type = 'lowpass';
    filter.frequency.value = 5200;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 1.6 * decay);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.layerGains.lead);
    if (this.reverb) {
      const send = ctx.createGain();
      send.gain.value = 0.55;
      g.connect(send);
      send.connect(this.reverb);
    }
    osc.start(time);
    osc2.start(time);
    osc.stop(time + 1.7 * decay);
    osc2.stop(time + 1.7 * decay);
  }

  _pad(time, notes, dur, gain) {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.boss ? 900 : 1300;
    filter.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.7);
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
      for (const det of [-7, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
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
    if (this.delay) g.connect(this.delay);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** A player shot, pitched into the current chord. Becomes part of the music. */
  playerNote(onBeat = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const chord = this._currentChord();
    const degs = [0, 1, 2, 1, 2, 0, 2, 1];
    const d = degs[this.playerNoteIndex % degs.length];
    this.playerNoteIndex++;
    const note = chord[d % chord.length] + 24 + (this.playerNoteIndex % 4 === 0 ? 12 : 0);
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
      send.gain.value = 0.55;
      g.connect(send);
      send.connect(this.delay);
    }
    if (onBeat && this.reverb) {
      const send = this.ctx.createGain();
      send.gain.value = 0.35;
      g.connect(send);
      send.connect(this.reverb);
    }
    osc.start(t);
    osc.stop(t + 0.6);
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

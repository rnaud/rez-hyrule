/**
 * CHIMERA — the vocal engine on the audio thread.
 *
 * Vendored from jamesondh/chimera-vocal-synth (MIT, see licenses/chimera-MIT.txt),
 * src/worklet/processor.ts + src/wasm/wire.ts. The Rust engine is compiled to a
 * freestanding wasm module and passed in through `processorOptions.module`, so this
 * file has no imports: an AudioWorkletGlobalScope has no fetch, TextEncoder or
 * module loader.
 *
 * Patch point for upstream changes: the gesture layout (272 bytes, version 1) and the
 * telemetry header are fixed by crates/chimera-wasm/src/lib.rs.
 */

const GESTURE_RECORD = 272;
const STEP_RECORD = 48;
const LAYOUT_VERSION = 1;

/** Control keys in the engine's order: 17 articulators, then the source channels. */
const CONTROL_KEYS = [
  'jaw', 'tbX', 'tbY', 'ttX', 'ttY', 'ttCurl', 'root', 'lipAp', 'lipProt', 'lipWidth',
  'labiodental', 'velum', 'larynx', 'epilarynx', 'ventricular', 'lateral', 'dorsum',
  'abduction', 'closure', 'breath', 'f0', 'vibrato',
];
const KEY_INDEX = Object.fromEntries(CONTROL_KEYS.map((k, i) => [k, i]));
const LABEL_CAP = 24;

/** UTF-8 encode (no TextEncoder in worklet scope). */
function utf8(s) {
  const out = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** Write gestures as records at `at`; returns how many were written. */
function writeGestures(buf, at, gestures, max) {
  const n = Math.min(gestures.length, max);
  const dv = new DataView(buf, at, n * GESTURE_RECORD);
  const bytes = new Uint8Array(buf, at, n * GESTURE_RECORD);
  for (let i = 0; i < n; i++) {
    const g = gestures[i];
    const o = i * GESTURE_RECORD;
    const head = [g.t0, g.t1, g.rampIn, g.rampOut, g.strength, g.speed ?? NaN, g.releaseHold ?? NaN, g.tag ?? NaN];
    for (let j = 0; j < 8; j++) dv.setFloat64(o + j * 8, head[j], true);
    for (let k = 0; k < CONTROL_KEYS.length; k++) dv.setFloat64(o + 64 + k * 8, NaN, true);
    for (const [key, value] of Object.entries(g.targets || {})) {
      const k = KEY_INDEX[key];
      if (k !== undefined && value !== undefined) dv.setFloat64(o + 64 + k * 8, value, true);
    }
    if (g.label === undefined) bytes[o + 240] = 255;
    else {
      let b = utf8(g.label);
      if (b.length > LABEL_CAP) {
        let cut = LABEL_CAP;
        while (cut > 0 && (b[cut] & 0xc0) === 0x80) cut--;
        b = b.slice(0, cut);
      }
      bytes[o + 240] = b.length;
      bytes.set(b, o + 241);
    }
  }
  return n;
}

/** Write beat steps (null: rest) as 48-byte records at `at`; returns the count. */
function writeSteps(buf, at, steps, max = 128) {
  const n = Math.min(steps.length, max);
  const dv = new DataView(buf, at, n * STEP_RECORD);
  const bytes = new Uint8Array(buf, at, n * STEP_RECORD);
  for (let i = 0; i < n; i++) {
    const s = steps[i];
    const o = i * STEP_RECORD;
    if (!s) { bytes[o] = 255; continue; }
    const b = utf8(s.id).slice(0, LABEL_CAP);
    bytes[o] = b.length;
    bytes.set(b, o + 1);
    dv.setFloat64(o + 32, s.note ?? NaN, true);
    dv.setFloat64(o + 40, s.accent ?? NaN, true);
  }
  return n;
}

/** Gestures taken from one schedule message. */
const MAX_GESTURES = 4000;
class ChimeraProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.x = new WebAssembly.Instance(options.processorOptions.module, {}).exports;
    if (this.x.chimera_layout_version() !== LAYOUT_VERSION) {
      throw new Error(`chimera: gesture layout ${this.x.chimera_layout_version()}, expected ${LAYOUT_VERSION}`);
    }
    if (this.x.chimera_gesture_record_size() !== GESTURE_RECORD) {
      throw new Error(`chimera: gesture record ${this.x.chimera_gesture_record_size()}, expected ${GESTURE_RECORD}`);
    }
    this.h = this.x.engine_new(sampleRate);
    this.failed = false;
    this.blocks = 0;
    this.load = 0;
    /** cumulative busy / wall time (Date.now is 1 ms, so this is the honest figure) */
    this.busy = 0;
    this.elapsed = 0;
    this.statsEvery = options.processorOptions.statsEvery || 12;
    this.port.onmessage = (e) => {
      if (this.failed) return;
      try {
        this.handle(e.data);
      } catch (err) {
        this.fail(err);
      }
    };
    this.port.postMessage({
      type: 'ready',
      sampleRate,
      layout: this.x.chimera_layout_version(),
      gestureRecord: this.x.chimera_gesture_record_size(),
      nPh: this.x.engine_n_ph(this.h),
      nOr: this.x.engine_n_or(this.h),
    });
  }

  fail(err) {
    if (this.failed) return;
    this.failed = true;
    this.port.postMessage({ type: 'error', message: `engine stopped: ${String(err)}` });
  }

  get mem() {
    return this.x.memory.buffer;
  }

  /** The engine's value area, cleared to NaN ("unchanged"). */
  values() {
    return new Float64Array(this.mem, this.x.engine_values(this.h), 32).fill(NaN);
  }

  handle(m) {
    const x = this.x;
    const h = this.h;
    switch (m.type) {
      case 'body':
        x.engine_set_body(h, m.body.female, m.body.child);
        this.port.postMessage({
          type: 'ready',
          sampleRate,
          layout: x.chimera_layout_version(),
          gestureRecord: x.chimera_gesture_record_size(),
          nPh: x.engine_n_ph(h),
          nOr: x.engine_n_or(h),
        });
        break;
      case 'artic': {
        const v = this.values();
        for (const [k, val] of Object.entries(m.values)) {
          const i = CONTROL_KEYS.indexOf(k);
          if (i >= 0 && typeof val === 'number') v[i] = val;
        }
        x.engine_set_artic(h, m.tipFree === undefined ? 2 : m.tipFree ? 1 : 0);
        break;
      }
      case 'source': {
        const SOURCE_KEYS = ['f0', 'glide', 'pressure', 'breathiness', 'tension', 'fry', 'roughness', 'vibratoDepth', 'vibratoRate', 'drift', 'voiced', 'brightness'];
        const v = this.values();
        for (const [k, val] of Object.entries(m.values)) {
          const i = SOURCE_KEYS.indexOf(k);
          if (i >= 0) v[i] = typeof val === 'boolean' ? (val ? 1 : 0) : val;
        }
        x.engine_set_source(h);
        break;
      }
      case 'gate':
        x.engine_set_gate(h, m.level);
        break;
      case 'schedule': {
        if (!m.gestures || !m.gestures.length) break;
        const n = writeGestures(this.mem, x.engine_records(h), m.gestures, MAX_GESTURES);
        x.engine_schedule(h, n, m.lead ?? 0.03, m.replace ? 1 : 0);
        break;
      }
      case 'stopSpeech':
        x.engine_stop_speech(h);
        break;
      case 'release':
        x.engine_release(h, m.tag);
        break;
      case 'beat': {
        const n = m.steps ? writeSteps(this.mem, x.engine_records(h), m.steps) : 0;
        x.engine_set_beat(h, m.steps ? 1 : 0, n, m.bpm ?? NaN, m.swing ?? NaN, m.playing === undefined ? 2 : m.playing ? 1 : 0);
        break;
      }
      case 'beatHit':
        writeSteps(this.mem, x.engine_records(h), [{ id: m.id, note: m.note, accent: m.accent }]);
        x.engine_beat_hit(h);
        break;
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const ch0 = out[0];
    if (this.failed) {
      for (const ch of out) ch.fill(0);
      return true;
    }
    const t0 = Date.now();
    try {
      const p = this.x.engine_render(this.h, ch0.length);
      ch0.set(new Float32Array(this.mem, p, ch0.length));
    } catch (err) {
      ch0.fill(0);
      this.fail(err);
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    const dt = Date.now() - t0;
    const budget = (ch0.length / sampleRate) * 1000;
    this.load += 0.05 * (dt / budget - this.load);
    this.busy += dt;
    this.elapsed += budget;
    if (!this.failed && ++this.blocks % this.statsEvery === 0) {
      try {
        this.port.postMessage({ type: 'stats', load: this.load, loadAvg: this.elapsed > 0 ? this.busy / this.elapsed : 0, clock: this.x.engine_clock(this.h), beatStep: this.x.engine_beat_step(this.h) });
      } catch (err) {
        this.fail(err);
      }
    }
    return true;
  }
}

registerProcessor('chimera', ChimeraProcessor);

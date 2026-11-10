/**
 * The CHIMERA engine (Rust → wasm) on the game's main thread: a synchronous JSON
 * call interface for everything that is not real time (lyrics → syllables, song
 * planning, beatbox lead-in). The AudioWorklet gets its own instance of the same
 * compiled module, so the audio thread never parses or allocates for planning.
 *
 * Vendored from jamesondh/chimera-vocal-synth (MIT); see licenses/chimera-MIT.txt.
 */

const WASM_PATH = 'chimera/chimera.wasm';

let module = null;
let exports = null;
let loading = null;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Compile the engine (once). Safe to call repeatedly; a failure can be retried. */
export function initChimera(url) {
  if (loading) return loading;
  loading = (async () => {
    const src = url || new URL(WASM_PATH, document.baseURI).href;
    const res = await fetch(src);
    if (!res.ok) throw new Error(`chimera: ${src}: HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    const compiled = await WebAssembly.compile(bytes);
    if (WebAssembly.Module.imports(compiled).length) throw new Error('chimera: the wasm module must not have imports');
    const instance = await WebAssembly.instantiate(compiled, {});
    const e = instance.exports;
    // The gesture record layout is shared with the worklet; a mismatched build
    // would sing nonsense, so refuse it up front.
    if (e.chimera_layout_version() !== 1 || e.chimera_gesture_record_size() !== 272) {
      throw new Error('chimera: unexpected engine layout');
    }
    exports = e;
    module = compiled;
  })();
  loading.catch(() => {
    loading = null;
    exports = null;
    module = null;
  });
  return loading;
}

export function chimeraReady() {
  return exports !== null;
}

/** The compiled module, for the AudioWorklet's own instance. */
export function chimeraModule() {
  if (!module) throw new Error('chimera not loaded (await initChimera())');
  return module;
}

function ex() {
  if (!exports) throw new Error('chimera not loaded (await initChimera())');
  return exports;
}

/** Call the engine's JSON interface; throws on an engine error. */
export function call(fn, args = {}) {
  const e = ex();
  const bytes = enc.encode(JSON.stringify({ fn, ...args }));
  const p = e.chimera_alloc(bytes.length);
  new Uint8Array(e.memory.buffer, p, bytes.length).set(bytes);
  const status = e.chimera_call(p, bytes.length);
  e.chimera_free(p, bytes.length);
  const out = dec.decode(new Uint8Array(e.memory.buffer, e.chimera_result_ptr(), e.chimera_result_len()));
  const value = JSON.parse(out);
  if (status !== 0) throw new Error(value.error || `engine ${fn} failed`);
  return value;
}

/** Lyrics (English) → sung syllables, through the page's dictionary when loaded. */
export function lyricsToSyllables(text) {
  return call('lyricsToSyllables', { text });
}

/**
 * Plan a whole melody. `notes`: [{ midi, beats, syl }] where `syl` comes from
 * lyricsToSyllables (or the shipped JSON). Times are on a plan clock that starts at
 * `options.t0`; the first vowel lands `t0` seconds in.
 */
export function planSong(notes, options) {
  return call('planSong', { notes, options });
}

/** The voice's steady pitch register for a body, given the stage's scale root. */
export function bodyFor(name) {
  if (name === 'male') return { female: 0, child: 0 };
  if (name === 'child') return { female: 1, child: 1 };
  return { female: 1, child: 0 };
}

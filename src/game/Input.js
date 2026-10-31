import { clamp } from './util.js';

/**
 * Pointer + keyboard aim. The reticle follows the pointer one-to-one,
 * and can also be driven by the arrow keys / WASD for keyboard play.
 */
export class Input {
  constructor() {
    this.aim = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.52 };
    this.enabled = false;
    this.pointerDown = false;
    this.spaceDown = false;
    this.keys = new Set();
    this.onAim = null;
    this.onLockStart = null;
    this.onLockEnd = null;
    this.onKey = null;
    this._prevHolding = false;
    this._pointerActive = false;
    this._bind();
  }

  _shouldIgnore(e) {
    const t = e.target;
    return t && t.closest && t.closest('button, .screen, #pause-btn, .ui-clickable');
  }

  _bind() {
    window.addEventListener('pointermove', (e) => {
      if (!this.enabled || this._shouldIgnore(e)) return;
      this._pointerActive = true;
      this._setAim(e.clientX, e.clientY);
    });

    window.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this._shouldIgnore(e)) return;
      if (e.button !== undefined && e.button !== 0) return;
      this._pointerActive = true;
      this._setAim(e.clientX, e.clientY);
      this.pointerDown = true;
    });

    const release = () => {
      this.pointerDown = false;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', () => {
      this.pointerDown = false;
      this.spaceDown = false;
      this.keys.clear();
    });

    window.addEventListener('keydown', (e) => {
      const code = e.code;
      this.keys.add(code);
      if (code === 'Space') {
        this.spaceDown = true;
        if (this.enabled) e.preventDefault();
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code) && this.enabled) {
        e.preventDefault();
      }
      this.onKey?.(code, e);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.spaceDown = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.pointerDown = false;
      this.spaceDown = false;
      this._prevHolding = false;
    }
  }

  setAimCenter() {
    this.aim.x = window.innerWidth * 0.5;
    this.aim.y = window.innerHeight * 0.52;
    this.onAim?.(this.aim.x, this.aim.y);
  }

  _setAim(x, y) {
    this.aim.x = clamp(x, 0, window.innerWidth);
    this.aim.y = clamp(y, 0, window.innerHeight);
    this.onAim?.(this.aim.x, this.aim.y);
  }

  get holding() {
    return this.enabled && (this.pointerDown || this.spaceDown || this.keys.has('KeyZ') || this.keys.has('KeyJ'));
  }

  update(dt) {
    if (!this.enabled) return;
    const speed = 980;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy += 1;
    if (dx || dy) {
      this._pointerActive = true;
      this._setAim(this.aim.x + dx * speed * dt, this.aim.y + dy * speed * dt);
    }

    const holding = this.holding;
    if (holding && !this._prevHolding) this.onLockStart?.();
    else if (!holding && this._prevHolding) this.onLockEnd?.();
    this._prevHolding = holding;
  }
}

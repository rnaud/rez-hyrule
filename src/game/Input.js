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
    this.onPadButton = null;
    this._prevHolding = false;
    this._pointerActive = false;
    this.aimSpeed = 1;
    this.gamepadEnabled = true;
    this.padDown = false;
    this.padIndex = null;
    this.padButtons = {};
    this._menuAxisHeld = false;
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
      this.padDown = false;
      this._prevHolding = false;
    }
  }

  setOptions({ aimSpeed = this.aimSpeed, gamepad = this.gamepadEnabled } = {}) {
    this.aimSpeed = Math.max(0.35, Math.min(2.5, aimSpeed));
    this.gamepadEnabled = !!gamepad;
    if (!this.gamepadEnabled) this.padDown = false;
  }

  _edge(gp, index) {
    const now = !!gp?.buttons?.[index]?.pressed;
    const prev = !!this.padButtons[index];
    this.padButtons[index] = now;
    return now && !prev;
  }

  _pollGamepad(dt) {
    if (!this.gamepadEnabled || !navigator.getGamepads) {
      this.padDown = false;
      return;
    }
    let gp = null;
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]?.connected) {
        gp = pads[i];
        this.padIndex = i;
        break;
      }
    }
    this.gamepadConnected = !!gp;
    if (!gp) {
      this.padDown = false;
      this.padButtons = {};
      return;
    }

    const confirm = this._edge(gp, 0);
    const back = this._edge(gp, 1);
    const ability = this._edge(gp, 2);
    const start = this._edge(gp, 9);

    if (!this.enabled) {
      if (confirm) this.onPadButton?.('confirm');
      if (back) this.onPadButton?.('back');
      if (start) this.onPadButton?.('confirm');

      // Menu navigation: D-pad or either stick. One step per press.
      const up = this._edge(gp, 12);
      const down = this._edge(gp, 13);
      const left = this._edge(gp, 14);
      const right = this._edge(gp, 15);
      if (down || right) this.onPadButton?.('menu-next');
      if (up || left) this.onPadButton?.('menu-prev');
      let ax = gp.axes[0] || 0;
      let ay = gp.axes[1] || 0;
      if (Math.abs(gp.axes[2] || 0) > Math.abs(ax)) ax = gp.axes[2] || 0;
      if (Math.abs(gp.axes[3] || 0) > Math.abs(ay)) ay = gp.axes[3] || 0;
      const axisHeld = Math.abs(ax) > 0.65 || Math.abs(ay) > 0.65;
      if (axisHeld && !this._menuAxisHeld) {
        if (Math.abs(ay) > Math.abs(ax)) this.onPadButton?.(ay > 0 ? 'menu-next' : 'menu-prev');
        else this.onPadButton?.(ax > 0 ? 'menu-next' : 'menu-prev');
      }
      this._menuAxisHeld = axisHeld;

      this.padDown = false;
      return;
    }
    this._menuAxisHeld = false;
    if (start) this.onPadButton?.('pause');
    if (ability) this.onPadButton?.('ability');

    const dead = 0.2;
    let ax = 0;
    let ay = 0;
    const lx = gp.axes[0] || 0;
    const ly = gp.axes[1] || 0;
    const rx = gp.axes[2] || 0;
    const ry = gp.axes[3] || 0;
    if (Math.abs(rx) > Math.abs(lx)) ax = rx;
    else ax = lx;
    if (Math.abs(ry) > Math.abs(ly)) ay = ry;
    else ay = ly;
    if (Math.abs(ax) < dead) ax = 0;
    if (Math.abs(ay) < dead) ay = 0;
    if (ax || ay) {
      const speed = 760 * this.aimSpeed;
      this._setAim(this.aim.x + ax * speed * dt, this.aim.y + ay * speed * dt);
    }

    this.padDown = !!(gp.buttons[7]?.pressed || gp.buttons[0]?.pressed);
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
    return this.enabled && (this.pointerDown || this.spaceDown || this.keys.has('KeyZ') || this.keys.has('KeyJ') || this.padDown);
  }

  update(dt) {
    this._pollGamepad(dt);
    if (!this.enabled) return;
    const speed = 980 * this.aimSpeed;
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

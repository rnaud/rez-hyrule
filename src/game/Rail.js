import * as THREE from 'three';
import { seeded, clamp, smoothstep } from './util.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * The Sacred Rail. A smooth Catmull-Rom flight path through a realm,
 * pre-sampled into arc-length frames for cheap lookups each frame.
 */
export class Rail {
  constructor(opts = {}) {
    const {
      seed = 1,
      span = 1560,
      points: pointCount = 27,
      swing = 22,
      rise = 7,
      climb = 0,
      freqs = [1.15, 2.7],
      phase = 0,
      straightTail = 0.16,
      straightHead = 0.06,
    } = opts;

    const rng = seeded(seed);
    this.span = span;
    this.seed = seed;

    const points = [];
    for (let i = 0; i < pointCount; i++) {
      const t = i / (pointCount - 1);
      const head = smoothstep(0, straightHead, t);
      const tail = 1 - smoothstep(1 - straightTail, 1, t);
      const env = head * tail;
      const x =
        (Math.sin(t * Math.PI * 2 * freqs[0] + phase) * swing +
          Math.sin(t * Math.PI * 2 * freqs[1] + phase * 1.7) * swing * 0.34 +
          (rng.next() - 0.5) * swing * 0.15) *
        env;
      const y =
        (Math.sin(t * Math.PI * 2 * (freqs[0] * 0.7) + phase * 0.6) * rise +
          Math.sin(t * Math.PI * 2 * freqs[1] * 0.55 + 1.3) * rise * 0.4) *
          env +
        t * climb;
      const z = -t * span;
      points.push(new THREE.Vector3(x, y, z));
    }

    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    this.length = this.curve.getLength();

    const sampleCount = Math.max(800, Math.ceil(this.length / 1.8));
    this.frames = [];
    const tmp = new THREE.Vector3();
    for (let i = 0; i <= sampleCount; i++) {
      const u = i / sampleCount;
      const pos = this.curve.getPointAt(u);
      const fwd = this.curve.getTangentAt(u).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, WORLD_UP).normalize();
      if (right.lengthSq() < 0.001) right.set(1, 0, 0);
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      this.frames.push({ pos, fwd, right, up });
    }
    this.sampleCount = sampleCount;

    this._frame = {
      pos: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      roll: 0,
    };
  }

  /** Interpolated frame at an arc-length distance (world units). */
  frameAt(distance, out = this._frame) {
    const t = clamp(distance / this.length, 0, 1) * this.sampleCount;
    const i = Math.min(this.sampleCount - 1, Math.floor(t));
    const f = t - i;
    const a = this.frames[i];
    const b = this.frames[i + 1];
    out.pos.lerpVectors(a.pos, b.pos, f);
    out.fwd.lerpVectors(a.fwd, b.fwd, f).normalize();
    out.right.lerpVectors(a.right, b.right, f).normalize();
    out.up.lerpVectors(a.up, b.up, f).normalize();
    return out;
  }

  positionAt(distance, out = new THREE.Vector3()) {
    const t = clamp(distance / this.length, 0, 1) * this.sampleCount;
    const i = Math.min(this.sampleCount - 1, Math.floor(t));
    return out.lerpVectors(this.frames[i].pos, this.frames[i + 1].pos, t - i);
  }

  /** Lateral/vertical offset from the rail in its local frame. */
  offsetAt(distance, lateral = 0, height = 0, out = new THREE.Vector3()) {
    const f = this.frameAt(distance, this._frame);
    return out.copy(f.pos).addScaledVector(f.right, lateral).addScaledVector(f.up, height);
  }

  /** Roll (banking) caused by curvature over a short look-ahead. */
  bankAt(distance, amount = 1) {
    const d = clamp(distance, 0, this.length - 40);
    const f1 = this.frameAt(d);
    const fwd1 = f1.fwd.clone();
    const right1 = f1.right.clone();
    const f2 = this.frameAt(d + 28);
    // Positive when the rail is bending to the right.
    const turn = fwd1.dot(f2.right) - right1.dot(f2.fwd) * 0.1;
    return clamp(-turn * 1.9, -0.32, 0.32) * amount;
  }
}

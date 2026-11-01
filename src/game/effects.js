import * as THREE from 'three';
import { lineMaterial, glowSprite } from './util.js';

const PARTICLE_VERTEX = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPixelRatio;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uPixelRatio * (380.0 / max(4.0, -mvPosition.z)), 1.0, 22.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAGMENT = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vColor, vAlpha * a * 0.65);
  }
`;

class ParticleField {
  constructor(scene, capacity = 900) {
    this.capacity = capacity;
    this.cursor = 0;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.alphas = new Float32Array(capacity);
    this.sizes = new Float32Array(capacity);
    this.velocities = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 } },
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
    // Start fully transparent.
    this.alphas.fill(0);
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  setPixelRatio(pr) {
    this.material.uniforms.uPixelRatio.value = pr;
  }

  spawn(pos, color, opts = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const i3 = i * 3;
    this.positions[i3] = pos.x;
    this.positions[i3 + 1] = pos.y;
    this.positions[i3 + 2] = pos.z;
    const c = color.isColor ? color : new THREE.Color(color);
    this.colors[i3] = c.r;
    this.colors[i3 + 1] = c.g;
    this.colors[i3 + 2] = c.b;
    const speed = opts.speed ?? 6;
    const dir = opts.dir
      ? opts.dir.clone()
      : new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    if (opts.dir) dir.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.35)).normalize();
    const s = speed * (0.35 + Math.random() * 0.9);
    this.velocities[i3] = dir.x * s;
    this.velocities[i3 + 1] = dir.y * s;
    this.velocities[i3 + 2] = dir.z * s;
    const life = (opts.life ?? 0.8) * (0.6 + Math.random() * 0.7);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = opts.drag ?? 1.1;
    this.gravity[i] = opts.gravity ?? 0;
    this.baseSize[i] = (opts.size ?? 1.2) * (0.6 + Math.random() * 0.8);
    this.sizes[i] = this.baseSize[i];
    this.alphas[i] = 1;
  }

  update(dt) {
    const pos = this.positions;
    const vel = this.velocities;
    let active = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        if (this.alphas[i] !== 0) {
          this.alphas[i] = 0;
          active = true;
        }
        continue;
      }
      active = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const damp = Math.exp(-this.drag[i] * dt);
      vel[i3] *= damp;
      vel[i3 + 1] = vel[i3 + 1] * damp + this.gravity[i] * dt;
      vel[i3 + 2] *= damp;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      this.alphas[i] = Math.pow(t, 1.35);
      this.sizes[i] = this.baseSize[i] * (0.5 + t * 0.9);
    }
    if (active) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
    }
  }
}

class Shockwaves {
  constructor(scene) {
    this.items = [];
    const geo = new THREE.RingGeometry(0.975, 1, 40);
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.items.push({ mesh, life: 0, maxLife: 1, size: 1, active: false });
    }
    this.cursor = 0;
    this.geo = geo;
  }

  spawn(pos, color, { size = 5, life = 0.5 } = {}) {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    item.mesh.position.copy(pos);
    item.mesh.material.color.set(color);
    item.mesh.material.opacity = 0.35;
    item.mesh.scale.setScalar(0.05);
    item.mesh.visible = true;
    item.active = true;
    item.life = life;
    item.maxLife = life;
    item.size = size;
  }

  update(dt, camera) {
    for (const item of this.items) {
      if (!item.active) continue;
      item.life -= dt;
      if (item.life <= 0) {
        item.active = false;
        item.mesh.visible = false;
        continue;
      }
      const t = 1 - item.life / item.maxLife;
      const ease = 1 - Math.pow(1 - t, 3);
      item.mesh.scale.setScalar(0.05 + ease * item.size);
      item.mesh.material.opacity = Math.pow(1 - t, 1.4) * 0.35;
      item.mesh.quaternion.copy(camera.quaternion);
    }
  }

  clear() {
    for (const item of this.items) {
      item.active = false;
      item.life = 0;
      item.mesh.visible = false;
      item.mesh.material.opacity = 0;
    }
  }
}

class Beam {
  constructor(game, { from, target, onArrive, color = 0xffe5a4, duration = 0.3, size = 1.1 }) {
    this.game = game;
    this.from = from.clone();
    this.target = target;
    this.onArrive = onArrive;
    this.color = color;
    this.duration = duration;
    this.age = 0;
    this.alive = true;
    this.size = size;
    this.end = target.pos.clone();
    this.curve = new THREE.QuadraticBezierCurve3(
      this.from,
      this.from.clone().add(new THREE.Vector3(0, 0, 0)),
      this.end
    );
    this.controlOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 5 + 1.5,
      (Math.random() - 0.5) * 6
    );

    this.group = new THREE.Group();
    const core = glowSprite(color, 2.1, 0.95);
    this.core = core;
    this.group.add(core);
    const halo = glowSprite(0xffffff, 1.0, 0.7);
    this.halo = halo;
    this.halo.scale.setScalar(1.3);
    this.group.add(halo);

    this.trailGeo = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(16 * 3);
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trailGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.trail = new THREE.Line(this.trailGeo, lineMaterial(color, { opacity: 0.7 }));
    this.trail.renderOrder = 3;
    this.group.add(this.trail);
    game.beamLayer.add(this.group);
    this._positionHead();
  }

  _controlPoint() {
    const mid = this.from.clone().lerp(this.end, 0.5);
    mid.add(this.controlOffset);
    return mid;
  }

  _positionHead() {
    const t = Math.min(1, this.age / this.duration);
    this.curve.v0.copy(this.from);
    this.curve.v1.copy(this._controlPoint());
    this.curve.v2.copy(this.end);
    const pos = this.curve.getPoint(Math.pow(t, 0.72));
    this.group.position.copy(pos);
    // Trail behind the head along the curve.
    const trailT = Math.pow(t, 0.72);
    const len = 12;
    for (let i = 0; i < 16; i++) {
      const back = (i / (len - 1)) * 0.38;
      const tt = Math.max(0, trailT - back * (0.35 + t * 0.65));
      const p = this.curve.getPoint(tt);
      this.trailPos[i * 3] = p.x - pos.x;
      this.trailPos[i * 3 + 1] = p.y - pos.y;
      this.trailPos[i * 3 + 2] = p.z - pos.z;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
    const pulse = 1 + Math.sin(this.age * 40) * 0.15;
    this.core.scale.setScalar(2.1 * this.size * pulse);
  }

  update(dt) {
    if (!this.alive) return;
    this.age += dt;
    if (this.target && this.target.ref && this.target.ref.alive) {
      this.end.copy(this.target.pos);
    }
    this._positionHead();
    if (this.age >= this.duration) {
      this.arrive();
    }
  }

  arrive() {
    if (!this.alive) return;
    this.alive = false;
    this.game.fx.impact(this.end, this.color, { scale: 1, quiet: false });
    this.onArrive?.(this.target);
    this.dispose();
  }

  dispose() {
    this.alive = false;
    if (this.group.parent) this.group.parent.remove(this.group);
    this.trailGeo.dispose();
  }
}

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.particles = new ParticleField(scene);
    this.shockwaves = new Shockwaves(scene);
    this.beams = [];
  }

  setPixelRatio(pr) {
    this.particles.setPixelRatio(pr);
  }

  update(dt) {
    this.particles.update(dt);
    this.shockwaves.update(dt, this.camera);
    for (const beam of this.beams) beam.update(dt);
    this.beams = this.beams.filter((b) => b.alive);
  }

  spawnWave(pos, color, opts = {}) {
    this.shockwaves.spawn(pos, color, opts);
  }

  /** Small hit feedback. */
  hit(pos, color = 0xff7bbf, { count = 9, speed = 5, size = 0.55, life = 0.4 } = {}) {
    for (let i = 0; i < count; i++) {
      this.particles.spawn(pos, color, { speed, size, life, drag: 2.5 });
    }
    this.spawnWave(pos, color, { size: 1.5, life: 0.28 });
  }

  /** Medium explosion for a destroyed enemy. */
  explode(pos, color = 0xff6fae, { count = 28, scale = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      this.particles.spawn(pos, i % 3 === 0 ? 0xfff3c4 : color, {
        speed: 8 * scale,
        size: 0.9 * scale,
        life: 0.85,
        drag: 1.3,
      });
    }
    this.spawnWave(pos, color, { size: 3.6 * scale, life: 0.5 });
    this.spawnWave(pos, 0xfff3c4, { size: 1.8 * scale, life: 0.32 });
  }

  /** Huge boss death / stage-clear detonation. */
  detonate(pos, color = 0xff3f92, { scale = 2.2 } = {}) {
    for (let i = 0; i < 100; i++) {
      const c = i % 4 === 0 ? 0xfff6d7 : i % 3 === 0 ? 0xffc2dd : color;
      this.particles.spawn(pos, c, {
        speed: 24 * scale,
        size: 1.8 * scale,
        life: 1.7,
        drag: 0.9,
      });
    }
    for (let i = 0; i < 5; i++) {
      this.spawnWave(pos, i % 2 ? 0xfff0c0 : color, { size: 12 + i * 9, life: 0.9 + i * 0.12 });
    }
  }

  /** Beam impact. */
  impact(pos, color = 0xffe5a4, { scale = 1 } = {}) {
    for (let i = 0; i < 10; i++) {
      this.particles.spawn(pos, i % 2 ? color : 0xffffff, { speed: 7 * scale, size: 0.65, life: 0.4, drag: 2.8 });
    }
    this.spawnWave(pos, color, { size: 2.0 * scale, life: 0.28 });
  }

  heal(pos) {
    for (let i = 0; i < 18; i++) {
      this.particles.spawn(pos, i % 2 ? 0xff9ab4 : 0xfff0c6, {
        speed: 4,
        size: 0.65,
        life: 1.0,
        drag: 1.4,
        gravity: 1.2,
      });
    }
    this.spawnWave(pos, 0xff8fa8, { size: 2.4, life: 0.4 });
  }

  sparkle(pos, color = 0xa8ffd8, count = 2) {
    for (let i = 0; i < count; i++) {
      this.particles.spawn(pos, color, { speed: 1.4, size: 0.32, life: 0.55, drag: 2 });
    }
  }

  teleport(pos, color = 0x9d7bff) {
    for (let i = 0; i < 22; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      this.particles.spawn(pos, color, { dir, speed: 9, size: 0.7, life: 0.65, drag: 2 });
    }
    this.spawnWave(pos, color, { size: 3.2, life: 0.45 });
  }

  fireBeam({ from, target, onArrive, color, duration = 0.3 }) {
    const beam = new Beam(this.beamGame, { from, target, onArrive, color, duration });
    this.beams.push(beam);
    return beam;
  }

  setBeamGame(game) {
    this.beamGame = game;
  }

  clear() {
    for (const beam of this.beams) beam.dispose();
    this.beams = [];
    this.shockwaves.clear();
    this.particles.alphas.fill(0);
    this.particles.geo.attributes.aAlpha.needsUpdate = true;
    this.particles.life.fill(0);
  }
}

import * as THREE from 'three';
import { glowSprite, lineMaterial } from './util.js';

let nextProjectileId = 1;

/**
 * Malice orbs. Slow enough to be tracked; targetable enough to be shot
 * out of the air for a little extra glory.
 */
export class Projectile {
  constructor(game, opts = {}) {
    this.game = game;
    this.id = nextProjectileId++;
    this.key = `p${this.id}`;
    this.alive = true;
    this.age = 0;
    this.delay = opts.delay ?? 0;
    this.speed = opts.speed ?? 44;
    this.damage = opts.damage ?? 2;
    this.radius = opts.radius ?? 1.25;
    this.color = opts.color ?? 0xff4f9d;
    this.boss = !!opts.boss;
    this.size = opts.size ?? 1;
    this.ttl = opts.ttl ?? 8;
    this.source = opts.source ?? null;

    this.origin = (opts.origin ?? new THREE.Vector3()).clone();
    this.pos = this.origin.clone();
    this.target = (opts.target ?? new THREE.Vector3()).clone();
    this.targetOffset = opts.targetOffset ?? new THREE.Vector3();
    this.wobblePhase = (game.random?.() ?? Math.random()) * Math.PI * 2;

    this.group = new THREE.Group();
    this.group.userData.projectile = this;

    this.core = glowSprite(this.color, 2.1 * this.size, 0.95);
    this.group.add(this.core);
    this.halo = glowSprite(0xffd9ec, 0.9 * this.size, 0.8);
    this.group.add(this.halo);
    this.dangerGeo = new THREE.OctahedronGeometry(0.38 * this.size);
    this.dangerMaterial = new THREE.MeshBasicMaterial({ color: 0xffd9ec });
    this.dangerCore = new THREE.Mesh(this.dangerGeo, this.dangerMaterial);
    this.group.add(this.dangerCore);

    // A short comet trail.
    this.trailGeo = new THREE.BufferGeometry();
    this.trailPositions = new Float32Array(8 * 3);
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.trail = new THREE.Line(
      this.trailGeo,
      lineMaterial(this.color, { opacity: 0.55 })
    );
    this.trail.renderOrder = 2;
    this.group.add(this.trail);

    this.group.visible = this.delay <= 0;
    game.projectileLayer.add(this.group);
    this._updateVisual();
  }

  get active() {
    return this.alive && this.delay <= 0;
  }

  getTargetInfo() {
    return {
      key: this.key,
      pos: this.pos,
      radius: this.radius * Math.max(0.7, this.size * 0.8),
      boss: this.boss,
      kind: 'projectile',
      ref: this,
    };
  }

  update(dt, game) {
    if (!this.alive) return;
    this.age += dt;
    if (this.delay > 0) {
      this.delay -= dt;
      this.group.visible = this.delay <= 0;
      if (this.delay > 0) return;
    }

    // Target the hero's living essence, with a little arcane wobble.
    const targetPoint = game.getPlayerHitPoint().add(this.targetOffset);
    const toTarget = targetPoint.sub(this.pos);
    const dist = toTarget.length();
    if (dist < 2.0) {
      this.hitPlayer(game);
      return;
    }
    toTarget.normalize();
    const wobble = Math.sin(this.age * 7 + this.wobblePhase) * 0.16;
    const perp = new THREE.Vector3(-toTarget.z, 0, toTarget.x).normalize().multiplyScalar(wobble);
    this.pos.addScaledVector(toTarget, this.speed * dt);
    this.pos.addScaledVector(perp, this.speed * dt * 0.35);

    if (this.age > this.ttl) {
      this.remove();
      return;
    }

    this._updateVisual();
    this._updateTrail(toTarget);
  }

  _updateVisual() {
    this.group.position.copy(this.pos);
    const pulse = 1 + Math.sin(this.age * 9 + this.wobblePhase) * 0.12;
    this.core.scale.setScalar(2.1 * this.size * pulse);
    this.halo.scale.setScalar(0.9 * this.size * (2 - pulse));
  }

  _updateTrail(dir) {
    const pos = this.trailPositions;
    for (let i = 0; i < 8; i++) {
      const back = i * (0.9 + this.size * 0.35);
      pos[i * 3] = -dir.x * back + Math.sin(this.age * 13 + i) * 0.05;
      pos[i * 3 + 1] = -dir.y * back + Math.cos(this.age * 11 + i) * 0.05;
      pos[i * 3 + 2] = -dir.z * back;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
  }

  takeDamage(amount, game) {
    if (!this.alive) return false;
    this.alive = false;
    game.onProjectileShot(this);
    this.remove();
    return true;
  }

  hitPlayer(game) {
    if (!this.alive) return;
    this.alive = false;
    game.onProjectileHitsPlayer(this);
    this.remove();
  }

  remove() {
    this.alive = false;
    if (this.group.parent) this.group.parent.remove(this.group);
    this.trailGeo.dispose();
    this.dangerGeo.dispose();
    this.dangerMaterial.dispose();
  }
}

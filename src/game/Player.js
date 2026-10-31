import * as THREE from 'three';
import { createLink } from './models.js';
import { damp, clamp, glowSprite, lineMaterial, TAU } from './util.js';

const _target = new THREE.Quaternion();
const _basis = new THREE.Matrix4();
const _roll = new THREE.Quaternion();
const _forward = new THREE.Vector3();
const _out = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.group = createLink();
    this.group.name = 'hero';
    game.playerLayer.add(this.group);
    this.parts = this.group.userData.parts;
    this.rail = null;
    this.distance = 0;
    this.lateral = 0;
    this.lateralTarget = 0;
    this.retX = 0;
    this.retY = 0;
    this.charging = false;
    this.chargeAmount = 0;
    this.fireAnim = 0;
    this.awaken = 1;
    this.time = 0;
    this.trailTimer = 0;
    this.dead = false;
    this.hitFlash = 0;
    this._baseArm = new THREE.Euler(0.1, 0, 0.24);
    this._rotationReady = false;

    // Per-instance glow sprites (their materials are cloned so opacity can animate).
    this.auraGlow = glowSprite(0x7bffb4, 1.6, 0.03);
    this.auraGlow.material = this.auraGlow.material.clone();
    this.auraGlow.position.y = 0.12;
    this.parts.aura.add(this.auraGlow);

    this.hitGlow = glowSprite(0xff3f5f, 5.5, 0);
    this.hitGlow.material = this.hitGlow.material.clone();
    this.hitGlow.position.y = 1.2;
    this.group.add(this.hitGlow);

    this.goldGlow = glowSprite(0xffe5a4, 1.1, 0);
    this.goldGlow.material = this.goldGlow.material.clone();
    this.goldGlow.position.set(0.75, 1.0, 0.2);
    this.group.add(this.goldGlow);

    // Three small triforce shards that orbit the hero once awakened.
    this.shards = new THREE.Group();
    this.shards.visible = false;
    this.group.add(this.shards);
    for (let i = 0; i < 3; i++) {
      const triGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.2, 0),
        new THREE.Vector3(-0.18, -0.12, 0),
        new THREE.Vector3(0.18, -0.12, 0),
      ]);
      const line = new THREE.LineLoop(triGeo, lineMaterial(0xffe6a6, { opacity: 0.8 }));
      line.userData.phase = (i / 3) * TAU;
      this.shards.add(line);
    }

    this.group.scale.setScalar(1.08);
  }

  setRail(rail) {
    this.rail = rail;
  }

  setAwaken(level) {
    this.awaken = clamp(level, 1, 10);
    this.shards.visible = level >= 5;
    const scale = 1 + (level - 1) * 0.035;
    this.parts.aura.scale.setScalar(scale);
    this.auraGlow.material.opacity = 0.018 + level * 0.0025;
    this.auraGlow.scale.setScalar(1.5 + level * 0.07);
    for (const shard of this.shards.children) {
      shard.material = lineMaterial(level >= 8 ? 0xd8fff0 : 0xffe6a6, { opacity: 0.55 + level * 0.02 });
    }
    this.goldGlow.material.opacity = level >= 3 ? 0.12 : 0;
  }

  setAim(reticleX, reticleY, screenW, screenH) {
    this.retX = clamp((reticleX / screenW) * 2 - 1, -1, 1);
    this.retY = clamp((reticleY / screenH) * 2 - 1, -1, 1);
  }

  setCharging(value) {
    this.charging = value;
  }

  firePulse() {
    this.fireAnim = 0.26;
  }

  damage() {
    this.hitFlash = 0.45;
  }

  getPosition(out = _out) {
    return out.copy(this.group.position);
  }

  getHitPoint(out = new THREE.Vector3()) {
    return out.copy(this.group.position).addScaledVector(this.rail?.up || this.group.up, 1.2);
  }

  getSwordTip(out = new THREE.Vector3()) {
    const sword = this.parts.sword;
    if (!sword) return this.getHitPoint(out);
    sword.localToWorld(out.set(0, -1.05, 0));
    return out;
  }

  update(dt, distance, time) {
    if (!this.rail) return;
    this.time = time;
    this.distance = distance;
    this.charging = !!this.charging;
    this.chargeAmount = damp(this.chargeAmount, this.charging ? 1 : 0, 12, dt);
    if (this.fireAnim > 0) this.fireAnim = Math.max(0, this.fireAnim - dt);
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.hitGlow.material.opacity = this.hitFlash > 0 ? 0.5 * Math.sin(this.hitFlash * 40) + 0.25 : 0;
    } else if (this.hitGlow.material.opacity !== 0) {
      this.hitGlow.material.opacity = 0;
    }

    const frame = this.rail.frameAt(distance);
    _forward.copy(frame.fwd);

    this.lateralTarget = this.retX * 0.85;
    this.lateral = damp(this.lateral, this.lateralTarget, 4.5, dt);
    const rise = this.chargeAmount * 0.18 - this.retY * 0.18;
    const hover = Math.sin(time * 1.8) * 0.1;
    const pos = frame.pos
      .clone()
      .addScaledVector(frame.right, this.lateral)
      .addScaledVector(frame.up, 2.65 + hover + rise);
    this.group.position.copy(pos);

    // Orient along the rail, with a gentle bank.
    _basis.makeBasis(frame.right, frame.up, _forward.clone().negate());
    _target.setFromRotationMatrix(_basis);
    _roll.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -this.retX * 0.16 + (this.chargeAmount * 0.06));
    _target.multiply(_roll);
    if (!this._rotationReady) {
      this.group.quaternion.copy(_target);
      this._rotationReady = true;
    } else {
      this.group.quaternion.slerp(_target, 1 - Math.exp(-8 * dt));
    }

    // Animation
    const p = this.parts;
    p.body.position.y = Math.sin(time * 2.4) * 0.035;
    p.body.rotation.z = this.retX * -0.045;
    p.head.rotation.y = this.retX * 0.12;
    p.cap.rotation.x = 1.02 + Math.sin(time * 1.35) * 0.035 + this.chargeAmount * 0.08;
    p.capTip.rotation.z = Math.sin(time * 2.1) * 0.18;
    p.fairy.position.set(
      Math.cos(time * 1.7) * 0.85,
      1.55 + Math.sin(time * 2.5) * 0.45,
      Math.sin(time * 1.7) * 0.55 + 0.2
    );
    p.fairy.scale.setScalar(0.8 + Math.sin(time * 6) * 0.1);
    p.aura.rotation.y += dt * (0.35 + this.chargeAmount * 1.2);
    p.runes.rotation.y -= dt * (0.5 + this.chargeAmount * 1.8);

    // sword arm: raise while locking, slash on fire
    const armTarget = { x: 0.1 - this.chargeAmount * 0.55 + (this.fireAnim > 0 ? -1.0 * Math.sin((this.fireAnim / 0.26) * Math.PI) : 0), z: 0.24 + this.chargeAmount * 0.25 };
    p.armR.rotation.x = damp(p.armR.rotation.x, armTarget.x, 12, dt);
    p.armR.rotation.z = damp(p.armR.rotation.z, armTarget.z, 10, dt);
    p.sword.rotation.z = damp(p.sword.rotation.z, -0.1 - this.chargeAmount * 0.6, 10, dt);
    const swordPulse = 0.8 + this.chargeAmount * 0.35 + (this.fireAnim > 0 ? 1.1 : 0) + Math.sin(time * 5) * 0.05;
    p.swordGlow.scale.setScalar(0.2 * swordPulse);
    this.goldGlow.material.opacity = (this.chargeAmount * 0.22 + (this.fireAnim > 0 ? 0.3 : 0)) * (this.awaken >= 2 ? 1 : 0.4);
    this.goldGlow.scale.setScalar(0.8 + this.chargeAmount * 0.7 + (this.fireAnim > 0 ? 0.8 : 0));

    // triforce shards orbit
    if (this.shards.visible) {
      this.shards.children.forEach((shard, i) => {
        const a = time * 0.7 + shard.userData.phase;
        shard.position.set(Math.cos(a) * 1.1, 1.2 + Math.sin(a * 2) * 0.35, Math.sin(a) * 0.7);
        shard.rotation.y = -a;
        shard.rotation.z = Math.sin(time * 2 + i) * 0.3;
      });
    }

    // Spark trail behind the hero.
    this.trailTimer -= dt;
    if (this.trailTimer <= 0 && !this.dead) {
      this.trailTimer = 0.17;
      const gp = this.group.position;
      this.game.fx?.sparkle(
        gp.clone().addScaledVector(frame.fwd, 0.9).addScaledVector(frame.up, 0.35),
        this.awaken >= 5 ? 0xffe5a4 : 0x7bffb4,
        1
      );
    }
  }

  setVisible(v) {
    this.group.visible = v;
  }

  reset() {
    this.dead = false;
    this.chargeAmount = 0;
    this.fireAnim = 0;
    this.hitFlash = 0;
    this.hitGlow.material.opacity = 0;
    this._rotationReady = false;
    this.setVisible(true);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.hitGlow.material.dispose();
    this.auraGlow.material.dispose();
    this.goldGlow.material.dispose();
  }
}

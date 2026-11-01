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
    for (const glow of [this.parts.swordGlow, this.parts.tipGlow]) {
      glow.material = glow.material.clone();
      glow.material.userData.shared = false;
    }
    this.swordLines = [];
    this.parts.sword.traverse((obj) => {
      if (!obj.isLine) return;
      obj.material = obj.material.clone();
      obj.material.userData.shared = false;
      obj.material.transparent = true;
      this.swordLines.push({ material: obj.material, opacity: obj.material.opacity });
    });
    // Start already in the sword-high guard rather than dropping into it.
    this.parts.armR.rotation.set(1.72, 0.3, 1.12);
    this.parts.foreR.rotation.set(0.65, 0.32, 0.24);
    this.parts.sword.rotation.set(-0.02, 0.24, -0.1);
    this.parts.armL.rotation.set(1.12, -0.386, -0.987);
    this.parts.foreL.rotation.set(-0.119, -0.176, -0.506);
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
    this.goldGlow.position.set(0.15, 1.45, 0.12);
    this.group.add(this.goldGlow);

    this.handGlow = this.parts.handGlow;
    if (this.handGlow) {
      this.handGlow.material = this.handGlow.material.clone();
      this.handGlow.material.userData.shared = false;
    }
    this.handSigil = this.parts.handSigil;
    if (this.handSigil) {
      this.handSigil.material = this.handSigil.material.clone();
      this.handSigil.material.userData.shared = false;
    }

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

    this.group.scale.setScalar(1.1);
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
    const tip = this.parts.swordTip;
    if (tip) {
      tip.updateWorldMatrix(true, false);
      return tip.getWorldPosition(out);
    }
    const sword = this.parts.sword;
    if (!sword) return this.getHitPoint(out);
    sword.localToWorld(out.set(0, -1.3, 0));
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
    const aimX = this.retX;
    const aimY = this.retY;
    const charge = this.chargeAmount;
    const fireProgress = this.fireAnim > 0 ? 1 - this.fireAnim / 0.26 : 0;
    const slash = Math.sin(fireProgress * Math.PI);
    const breath = Math.sin(time * 1.45);
    const secondary = Math.sin(time * 2.2 + 0.8);

    p.body.position.y = Math.sin(time * 2.4) * 0.038;
    p.body.rotation.x = damp(p.body.rotation.x, 0.045 - aimY * 0.028 + charge * 0.03, 6, dt);
    p.body.rotation.y = damp(p.body.rotation.y, -aimX * 0.085 + slash * 0.12, 7, dt);
    p.body.rotation.z = damp(p.body.rotation.z, aimX * -0.045, 7, dt);
    p.head.rotation.y = damp(p.head.rotation.y, aimX * 0.16, 8, dt);
    p.head.rotation.x = damp(p.head.rotation.x, -aimY * 0.07 + breath * 0.012, 7, dt);
    p.cap.rotation.x = 1.02 + Math.sin(time * 1.35) * 0.035 + charge * 0.08;
    p.capTip.rotation.z = Math.sin(time * 2.1) * 0.18;
    p.fairy.position.set(
      Math.cos(time * 1.7) * 0.85,
      1.55 + Math.sin(time * 2.5) * 0.45,
      Math.sin(time * 1.7) * 0.55 + 0.2
    );
    p.fairy.scale.setScalar(0.8 + Math.sin(time * 6) * 0.1);
    p.aura.rotation.y += dt * (0.35 + charge * 1.2);
    p.runes.rotation.y -= dt * (0.5 + charge * 1.8);

    // A heroic guard: sword held high and out, left palm open toward the reticle.
    const armRx = 1.72 + charge * 0.14 - slash * 0.52 + breath * 0.018 - aimY * 0.04;
    const armRy = 0.3 - aimX * 0.18 - slash * 0.05;
    const armRz = 1.12 + charge * 0.05 + slash * 0.06;
    const foreRx = 0.65 + charge * 0.12 - slash * 0.22;
    const foreRy = 0.32 + aimX * 0.05;
    const foreRz = 0.24 + charge * 0.2 - slash * 0.42;
    const swordRx = -0.02 + charge * 0.12 + slash * 0.65;
    const swordRy = 0.24 - aimX * 0.08;
    const swordRz = -0.1 - charge * 0.06 + slash * 0.2;

    const armLx = 1.12 + charge * 0.2 + slash * 0.2 + secondary * 0.025 - aimY * 0.035;
    const armLy = -0.386 - aimX * 0.13 + charge * 0.05;
    const armLz = -0.987 + charge * 0.08;
    const foreLx = -0.119 + charge * 0.1 - slash * 0.12;
    const foreLy = -0.176;
    const foreLz = -0.506 - charge * 0.07;

    p.armR.rotation.x = damp(p.armR.rotation.x, armRx, 10, dt);
    p.armR.rotation.y = damp(p.armR.rotation.y, armRy, 10, dt);
    p.armR.rotation.z = damp(p.armR.rotation.z, armRz, 10, dt);
    p.foreR.rotation.x = damp(p.foreR.rotation.x, foreRx, 12, dt);
    p.foreR.rotation.y = damp(p.foreR.rotation.y, foreRy, 11, dt);
    p.foreR.rotation.z = damp(p.foreR.rotation.z, foreRz, 12, dt);
    p.sword.rotation.x = damp(p.sword.rotation.x, swordRx, 14, dt);
    p.sword.rotation.y = damp(p.sword.rotation.y, swordRy, 12, dt);
    p.sword.rotation.z = damp(p.sword.rotation.z, swordRz, 12, dt);

    p.armL.rotation.x = damp(p.armL.rotation.x, armLx, 9, dt);
    p.armL.rotation.y = damp(p.armL.rotation.y, armLy, 9, dt);
    p.armL.rotation.z = damp(p.armL.rotation.z, armLz, 9, dt);
    p.foreL.rotation.x = damp(p.foreL.rotation.x, foreLx, 10, dt);
    p.foreL.rotation.y = damp(p.foreL.rotation.y, foreLy, 10, dt);
    p.foreL.rotation.z = damp(p.foreL.rotation.z, foreLz, 10, dt);

    const swordPulse = 0.85 + charge * 0.4 + slash * 0.9 + Math.sin(time * 5) * 0.05;
    for (const line of this.swordLines) line.material.opacity = line.opacity * (0.35 + slash * 0.65);
    p.swordGlow.material.opacity = 0.07 + slash * 0.25;
    p.tipGlow.material.opacity = 0.12 + slash * 0.4;
    p.swordGlow.scale.setScalar(0.22 * swordPulse);
    p.tipGlow.scale.setScalar(0.2 + charge * 0.2 + slash * 0.35 + Math.sin(time * 6) * 0.015);
    if (this.handGlow) {
      this.handGlow.material.opacity = 0.035 + charge * 0.34 + slash * 0.12 + Math.max(0, breath) * 0.018;
      this.handGlow.scale.setScalar(0.38 + charge * 0.2 + slash * 0.16);
    }
    if (this.handSigil) {
      this.handSigil.rotation.z -= dt * (0.45 + charge * 2.8 + slash * 1.6);
      this.handSigil.material.opacity = 0.18 + charge * 0.4 + slash * 0.1;
    }
    this.goldGlow.material.opacity = (charge * 0.22 + slash * 0.18) * (this.awaken >= 2 ? 1 : 0.4);
    this.goldGlow.scale.setScalar(0.8 + charge * 0.7 + slash * 0.5);

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
    for (const line of this.swordLines) line.material.dispose();
    this.parts.swordGlow.material.dispose();
    this.parts.tipGlow.material.dispose();
    this.hitGlow.material.dispose();
    this.auraGlow.material.dispose();
    this.goldGlow.material.dispose();
    this.handGlow?.material?.dispose?.();
    this.handSigil?.material?.dispose?.();
  }
}

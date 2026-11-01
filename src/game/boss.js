import * as THREE from 'three';
import { createBossModel } from './models.js';
import { clamp, glowSprite, lineMaterial, TAU } from './util.js';

const DISTANCE = 62;
const HEIGHT = 10.5;
const _camTarget = new THREE.Vector3();

let nextBossId = 1;

function makeCircleGeometry(radius, segments = 36) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function createEyeVisual(scale, color, gold, isCore = false) {
  const group = new THREE.Group();
  const geoms = [];
  const outerGeo = makeCircleGeometry(1.05 * scale, 36);
  geoms.push(outerGeo);
  const outer = new THREE.Line(outerGeo, lineMaterial(gold, { opacity: 0.9 }));
  group.add(outer);

  const irisGeo = makeCircleGeometry(0.78 * scale, 28);
  geoms.push(irisGeo);
  const iris = new THREE.Line(irisGeo, lineMaterial(color, { opacity: 0.9 }));
  group.add(iris);

  const innerGeo = makeCircleGeometry(0.45 * scale, 20);
  geoms.push(innerGeo);
  const inner = new THREE.Line(innerGeo, lineMaterial(0xffeef7, { opacity: 0.55 }));
  group.add(inner);

  // slit pupil
  const slit = [
    new THREE.Vector3(0, 0.7 * scale, 0),
    new THREE.Vector3(0.16 * scale, 0, 0.02),
    new THREE.Vector3(0, -0.7 * scale, 0),
    new THREE.Vector3(-0.16 * scale, 0, 0.02),
  ];
  const slitGeo = new THREE.BufferGeometry().setFromPoints([...slit, slit[0]]);
  geoms.push(slitGeo);
  const pupil = new THREE.Line(slitGeo, lineMaterial(0x1a020c, { opacity: 0.9 }));
  group.add(pupil);
  const pupilGlow = new THREE.Line(slitGeo, lineMaterial(color, { opacity: 0.95 }));
  pupilGlow.position.z = 0.01;
  group.add(pupilGlow);

  // radial lashes
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a) * 1.1 * scale, Math.sin(a) * 1.1 * scale, 0),
      new THREE.Vector3(Math.cos(a + 0.08) * 1.45 * scale, Math.sin(a + 0.08) * 1.45 * scale, 0),
    ]);
    geoms.push(g);
    const lash = new THREE.Line(g, lineMaterial(gold, { opacity: 0.55 }));
    group.add(lash);
  }

  const glow = glowSprite(color, 3.6 * scale, 0.6);
  glow.material = glow.material.clone();
  glow.material.userData.shared = false;
  group.add(glow);
  const white = glowSprite(0xfff0f8, 1.1 * scale, 0.65);
  white.material = white.material.clone();
  white.material.userData.shared = false;
  group.add(white);

  // A target ring that spins slowly behind the eye.
  const runeGeo = makeCircleGeometry(1.7 * scale, 6);
  geoms.push(runeGeo);
  const rune = new THREE.Line(runeGeo, lineMaterial(gold, { opacity: 0.3 }));
  group.add(rune);

  return { group, glow, white, rune, geoms, color, gold };
}

export class Boss {
  constructor(game, config) {
    this.game = game;
    this.cfg = config;
    this.id = nextBossId++;
    this.alive = true;
    this.dying = false;
    this.time = 0;
    this.introT = 0;
    this.attackTimer = 2.8;
    this.attackIndex = 0;
    this.phase = 1;
    this.shakeCooldown = 0;
    this.center = new THREE.Vector3();
    this.basis = { right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, -1) };

    this.group = createBossModel(this.cfg.model);
    this.group.name = 'boss';
    this.group.scale.setScalar(0.001);
    this.baseScale = this.cfg.scale * 3.4;
    game.bossLayer.add(this.group);

    // Core and weak spots.
    this.weakspots = [];
    for (let i = 0; i < this.cfg.weakspots; i++) {
      const vis = createEyeVisual(2.15, this.cfg.color, 0xffdc8f, false);
      game.bossFxLayer.add(vis.group);
      this.weakspots.push({
        key: `b${this.id}w${i}`,
        isCore: false,
        alive: true,
        active: true,
        hp: this.cfg.weakspotHp,
        maxHp: this.cfg.weakspotHp,
        angle: (i / this.cfg.weakspots) * TAU,
        orbit: this.cfg.orbitRadius * (1.9 + (i % 2) * 0.35),
        heightOffset: 2.4 + (i % 2) * 3.2,
        radius: 3.4,
        pos: new THREE.Vector3(),
        vis,
        flash: 0,
        phaseOffset: i * 1.7,
      });
    }
    const coreVis = createEyeVisual(3.6, this.cfg.color, 0xffdc8f, true);
    coreVis.group.visible = false;
    game.bossFxLayer.add(coreVis.group);
    this.core = {
      key: `b${this.id}core`,
      isCore: true,
      alive: true,
      active: false,
      hp: this.cfg.coreHp,
      maxHp: this.cfg.coreHp,
      radius: 4.6,
      pos: new THREE.Vector3(),
      vis: coreVis,
      flash: 0,
      angle: 0,
      orbit: 0,
      heightOffset: 0.5,
      phaseOffset: 0,
    };

    this.maxHealth = this.totalMaxHealth();
    this.spawnGlow = glowSprite(0xffffff, 46, 0.6);
    this.spawnGlow.material = this.spawnGlow.material.clone();
    this.spawnGlow.material.userData.shared = false;
    game.bossFxLayer.add(this.spawnGlow);

    this.parts = {
      legs: [0, 1, 2, 3, 4, 5].map((i) => this.group.getObjectByName(`leg${i}`)).filter(Boolean),
      petals: [0, 1, 2, 3, 4, 5].map((i) => this.group.getObjectByName(`petal${i}`)).filter(Boolean),
      jaw: this.group.getObjectByName('jaw'),
      mandL: this.group.getObjectByName('mandL'),
      mandR: this.group.getObjectByName('mandR'),
      head: this.group.getObjectByName('head'),
      crest: this.group.getObjectByName('crest'),
      sword: this.group.getObjectByName('demonSword'),
      limbs: [0, 1, 2, 3].map((i) => this.group.getObjectByName(`limb${i}`)).filter(Boolean),
    };
    this._updatePhase(true);
  }

  get name() {
    return this.cfg.name;
  }

  totalMaxHealth() {
    return this.cfg.weakspots * this.cfg.weakspotHp + this.cfg.coreHp;
  }

  get activeTargets() {
    const out = [];
    for (const w of this.weakspots) if (w.alive && w.active) out.push(w);
    if (this.core.active && this.core.alive) out.push(this.core);
    return out;
  }

  getTargetInfos() {
    return this.activeTargets.map((t) => ({
      key: t.key,
      pos: t.pos,
      radius: t.radius,
      boss: true,
      kind: 'boss',
      ref: t,
      bossRef: this,
    }));
  }

  get healthRatio() {
    let hp = 0;
    for (const w of this.weakspots) if (w.alive) hp += Math.max(0, w.hp);
    if (this.core.alive) hp += Math.max(0, this.core.hp);
    return clamp(hp / this.maxHealth, 0, 1);
  }

  startIntro() {
    this.game.audio?.bossRoar?.();
  }

  update(dt, game) {
    if (!this.alive && !this.dying) return;
    this.time += dt;
    this.introT = Math.min(1, this.introT + dt / 1.9);
    this.attackTimer -= dt;
    this.shakeCooldown = Math.max(0, this.shakeCooldown - dt);

    const f = game.rail.frameAt(game.playerDistance + DISTANCE);
    this.basis.right.copy(f.right);
    this.basis.up.copy(f.up);
    this.basis.fwd.copy(f.fwd);

    const follow = (game.player?.lateral || 0) * 2.8;
    const sway = Math.sin(this.time * 0.55) * (this.boss ? 4.6 : 5.5) + follow;
    const rise = Math.sin(this.time * 0.9 + 1.2) * 0.8;
    this.center
      .copy(f.pos)
      .addScaledVector(f.up, HEIGHT + rise)
      .addScaledVector(f.right, sway);
    this.group.position.copy(this.center);
    _camTarget.set(game.camera.position.x, this.center.y, game.camera.position.z);
    this.group.lookAt(_camTarget);

    const introEase = 1 - Math.pow(1 - this.introT, 3);
    const scale = this.baseScale * (0.05 + 0.95 * introEase);
    this.group.scale.setScalar(scale);
    this.spawnGlow.position.copy(this.center);
    this.spawnGlow.scale.setScalar(46 * (1.2 - this.introT * 0.9));
    this.spawnGlow.material.opacity = this.introT < 1 ? 0.6 * (1 - this.introT) : 0;

    // Weakspot orbits.
    for (const w of this.weakspots) {
      if (!w.alive) continue;
      const angle = w.angle + this.time * this.cfg.orbitSpeed;
      w.pos
        .copy(this.center)
        .addScaledVector(f.right, Math.cos(angle) * w.orbit)
        .addScaledVector(f.up, Math.sin(angle) * w.orbit * 0.55 + w.heightOffset)
        .addScaledVector(f.fwd, -2.2);
      this._updateEye(w, dt);
    }
    this.core.pos.copy(this.center).addScaledVector(f.up, this.core.heightOffset).addScaledVector(f.fwd, -3.2);
    this._updateEye(this.core, dt);

    if (this.core.vis.group.visible) {
      this.core.vis.group.visible = this.core.active;
    }

    this._animate(dt);

    if (this.introT >= 1 && !this.dying && this.attackTimer <= 0) {
      this._attack();
      const base = this.phase === 3 ? 1.55 : this.phase === 2 ? 2.1 : 2.65;
      this.attackTimer = base + this.game.random() * 0.8;
    }

    if (this.dying) {
      this.group.rotation.z += dt * 0.6;
      this.group.position.addScaledVector(f.up, Math.sin(this.time * 8) * 0.1);
    }
  }

  _updateEye(target, dt) {
    const vis = target.vis;
    if (!target.alive) {
      vis.group.visible = false;
      return;
    }
    if (target.isCore && !target.active) {
      vis.group.visible = false;
      return;
    }
    vis.group.visible = true;
    vis.group.position.copy(target.pos);
    vis.group.quaternion.copy(this.game.camera.quaternion);
    const pulse = 1 + Math.sin(this.time * 3.4 + target.phaseOffset) * 0.05;
    vis.group.scale.setScalar(pulse);
    vis.rune.rotation.z += dt * 0.5;
    if (target.flash > 0) {
      target.flash = Math.max(0, target.flash - dt);
      const f = target.flash / 0.2;
      vis.glow.material.opacity = 0.6 + f * 0.9;
      vis.white.material.opacity = 0.65 + f;
    } else {
      vis.glow.material.opacity = 0.45 + Math.sin(this.time * 4 + target.phaseOffset) * 0.12;
      vis.white.material.opacity = 0.55;
    }
    if (target.isCore) {
      vis.group.scale.multiplyScalar(1.1 + Math.sin(this.time * 2) * 0.04);
    }
  }

  _animate(dt) {
    const t = this.time;
    const p = this.parts;
    switch (this.cfg.model) {
      case 'gohma': {
        for (let i = 0; i < p.legs.length; i++) {
          const leg = p.legs[i];
          leg.rotation.x = Math.sin(t * 1.6 + i) * 0.12;
          leg.rotation.z = Math.cos(t * 1.2 + i * 1.3) * 0.08;
        }
        if (p.mandL) p.mandL.rotation.x = Math.sin(t * 2.2) * 0.15 - 0.1;
        if (p.mandR) p.mandR.rotation.x = Math.sin(t * 2.2 + 1) * 0.15 - 0.1;
        this.group.rotation.z = Math.sin(t * 0.5) * 0.025;
        break;
      }
      case 'bloom': {
        for (let i = 0; i < p.petals.length; i++) {
          const petal = p.petals[i];
          const breathe = Math.sin(t * 0.8 + i * 0.9) * 0.12;
          petal.rotation.x = -0.25 + breathe;
          petal.rotation.z = Math.sin(t * 0.5 + i) * 0.05;
        }
        this.group.rotation.z = Math.sin(t * 0.4) * 0.03;
        break;
      }
      case 'dodongo': {
        if (p.jaw) p.jaw.rotation.x = 0.16 + Math.max(0, Math.sin(t * 1.3)) * 0.2 + (this.phase === 3 ? 0.15 : 0);
        if (p.head) p.head.rotation.z = Math.sin(t * 0.7) * 0.04;
        for (let i = 0; i < p.limbs.length; i++) {
          p.limbs[i].rotation.x = Math.sin(t * 1.1 + i) * 0.04;
        }
        this.group.rotation.z = Math.sin(t * 0.5) * 0.02;
        break;
      }
      case 'ganon': {
        if (p.jaw) p.jaw.rotation.x = 0.1 + Math.max(0, Math.sin(t * 0.8)) * 0.16;
        if (p.crest) p.crest.rotation.z = Math.sin(t * 0.9) * 0.08;
        this.group.rotation.z = Math.sin(t * 0.35) * 0.02;
        break;
      }
      case 'demise': {
        if (p.head) p.head.rotation.z = Math.sin(t * 0.45) * 0.04;
        if (p.jaw) p.jaw.rotation.x = 0.08 + Math.max(0, Math.sin(t * 1.1)) * 0.22 + this.phase * 0.03;
        if (p.mandL) p.mandL.rotation.z = 0.35 + Math.sin(t * 0.7) * 0.06;
        if (p.mandR) p.mandR.rotation.z = -0.35 - Math.sin(t * 0.7 + 1) * 0.06;
        if (p.sword) p.sword.rotation.z = -0.7 + Math.sin(t * 0.9) * 0.12;
        if (p.crest) p.crest.rotation.z = Math.PI + Math.sin(t * 1.1) * 0.08;
        this.group.rotation.z = Math.sin(t * 0.3) * 0.018;
        break;
      }
      default:
        break;
    }
    this.group.position.y += Math.sin(t * 1.1) * 0.22;
  }

  _attack() {
    const game = this.game;
    const aliveWeak = this.weakspots.filter((w) => w.alive);
    const finalPatterns =
      this.phase === 3
        ? ['rain', 'spiral', 'fan', 'volley', 'spawn']
        : this.phase === 2
          ? ['spiral', 'rain', 'volley', 'spawn']
          : ['volley', 'fan', 'spawn'];
    const patterns = this.cfg.finalBoss
      ? finalPatterns
      : this.phase === 3
        ? ['spiral', 'fan', 'spawn', 'volley']
        : this.phase === 2
          ? ['spiral', 'volley', 'spawn']
          : ['volley', 'fan', 'spawn'];
    const pattern = patterns[this.attackIndex++ % patterns.length];
    if (pattern === 'spawn') {
      game.spawnBossMinions(this, this.phase === 3 ? 3 : 2);
      return;
    }
    if (pattern === 'volley') {
      const count = this.phase === 3 ? 6 : 4;
      for (let i = 0; i < count; i++) {
        game.spawnBossProjectile(this, {
          delay: i * 0.12,
          speed: 38 + this.phase * 4,
          size: 1.25,
          offset: new THREE.Vector3((i - (count - 1) / 2) * 2.2, Math.sin(i * 1.7) * 2.2, 0),
        });
      }
      game.audio?.bossRoar?.();
    } else if (pattern === 'spiral') {
      const count = this.phase === 3 ? 14 : 9;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU * 1.6;
        game.spawnBossProjectile(this, {
          delay: i * 0.075,
          speed: 40,
          size: 1.0,
          offset: new THREE.Vector3(Math.cos(a) * 4.2, Math.sin(a) * 3.0, 0),
        });
      }
      game.audio?.bossRoar?.();
    } else if (pattern === 'rain') {
      const count = this.phase === 3 ? 12 : 8;
      const f = game.rail.frameAt(game.playerDistance + DISTANCE);
      for (let i = 0; i < count; i++) {
        const origin = this.center
          .clone()
          .addScaledVector(f.right, (this.game.random() - 0.5) * 34)
          .addScaledVector(f.up, 8 + this.game.random() * 10)
          .addScaledVector(f.fwd, -6 + this.game.random() * 12);
        game.spawnBossProjectile(this, {
          delay: i * 0.09,
          speed: 32 + this.phase * 4,
          size: 1.35,
          origin,
          offset: new THREE.Vector3((this.game.random() - 0.5) * 3, (this.game.random() - 0.5) * 2, 0),
        });
      }
      game.audio?.bossRoar?.();
    } else if (pattern === 'fan') {
      for (const w of aliveWeak) {
        for (let i = 0; i < 2; i++) {
          game.spawnBossProjectile(this, {
            delay: 0.1 + i * 0.22,
            speed: 42,
            size: 1.1,
            origin: w.pos.clone(),
            offset: new THREE.Vector3((i - 0.5) * 4, (this.game.random() - 0.5) * 2, 0),
          });
        }
      }
      game.audio?.bossRoar?.();
    }
  }

  takeDamageAt(targetKey, amount, game) {
    if (!this.alive || this.dying) return { hit: false, killed: false };
    let target = this.weakspots.find((w) => w.key === targetKey);
    if (!target) target = this.core.key === targetKey ? this.core : null;
    if (!target || !target.alive || !target.active) return { hit: false, killed: false };
    target.hp -= amount;
    target.flash = 0.2;
    this.game.fx?.impact(target.pos, 0xffe5a4, { scale: 1.2 });
    this.game.audio?.hitMarker?.();
    if (this.shakeCooldown <= 0) {
      game.shake?.(0.2, 0.18);
      this.shakeCooldown = 0.12;
    }
    let killed = false;
    if (target.hp <= 0) {
      target.alive = false;
      target.active = false;
      target.vis.group.visible = false;
      this.game.fx?.explode(target.pos, this.cfg.color, { count: 55, scale: 1.9 });
      this.game.audio?.explode?.(1.5);
      killed = true;
      if (!target.isCore) this._onWeakspotDestroyed();
    }
    this.game.onBossDamaged?.(this, killed);
    if (killed && target.isCore) this.startDeath(this.game);
    return { hit: true, killed };
  }

  _onWeakspotDestroyed() {
    const destroyed = this.weakspots.filter((w) => !w.alive).length;
    if (destroyed >= this.weakspots.length) {
      this.exposeCore();
    } else {
      this.attackTimer = Math.min(this.attackTimer, 1.4);
      this.game.hud?.flash?.('fire');
    }
    this._updatePhase();
  }

  exposeCore() {
    this.phase = 3;
    this.core.active = true;
    this.core.hp = this.cfg.coreHp;
    this.core.vis.group.visible = true;
    this.core.flash = 0.4;
    this.attackTimer = 1.2;
    this.game.fx?.explode(this.core.pos, this.cfg.color, { count: 46, scale: 2.1 });
    this.game.fx?.spawnWave(this.core.pos, 0xfff0c0, { size: 7, life: 0.55 });
    this.game.audio?.bossRoar?.();
    this.game.hud?.flash?.('fire');
    this.game.shake?.(0.8, 0.5);
    this._updatePhase(true);
  }

  _updatePhase(force = false) {
    const phase = this.core.active ? 3 : this.weakspots.some((w) => !w.alive) ? 2 : 1;
    if (!force && phase === this.phase && this._phaseAnnounced) return;
    this.phase = phase;
    this._phaseAnnounced = true;
    this.game.onBossPhase?.(this, phase);
  }

  startDeath(game) {
    if (this.dying) return;
    this.alive = false;
    this.dying = true;
    this.attackTimer = Infinity;
    this.game.fx?.detonate(this.center, this.cfg.color, { scale: 2.6 });
    this.game.audio?.explode?.(2);
    this.game.audio?.bossRoar?.();
    this.core.vis.group.visible = false;
    for (const w of this.weakspots) w.vis.group.visible = false;
    this.spawnGlow.material.opacity = 0;
    game.onBossDefeated?.(this);
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this.core.vis.group.parent) this.core.vis.group.parent.remove(this.core.vis.group);
    for (const w of this.weakspots) w.vis.group.parent?.remove(w.vis.group);
    for (const w of [...this.weakspots, this.core]) {
      w.vis.geoms.forEach((g) => g.dispose());
      w.vis.glow.material.dispose();
      w.vis.white.material.dispose();
    }
    this.spawnGlow.material.dispose();
    this.spawnGlow.parent?.remove(this.spawnGlow);
  }
}

